import { z } from "zod";
import type { ChatRequest, ChatResult } from "@/lib/llm/types";
import { entities, runLog, type EntityRow, type ProjectRow } from "@/lib/db/repo";
import { readSite, type SiteInfo } from "@/lib/site/read";
import { clip } from "@/lib/util/sanitize";
import { gateToolCall, type AllowedTool, type SlimResult } from "./tools";
import { marketMessages } from "./prompts";
import { resolveEntity } from "./resolve";

/**
 * The website flow ("paste your website"): one run walks six visible steps. Steps 1-2 live here (read the
 * site, find the competitors); 3-5 are the Workers' Qloo research split into phases; 6 is the Composer.
 * Progress is written as "step" log rows, so the page can replay it from the DB at any time.
 */
export const SITE_TRIGGER = "site";
export const WIZ_STEPS = [
  { n: 1, key: "site", title: "Learning about your website" },
  { n: 2, key: "market", title: "Finding your competitors" },
  { n: 3, key: "where", title: "Map where their fans are" },
  { n: 4, key: "who", title: "Profiling their fans" },
  { n: 5, key: "gap", title: "Find the switching gap" },
  { n: 6, key: "ads", title: "Design your campaign" },
] as const;

/** Worker phases for steps 3-5: which required calls (run.ts requiredCalls keys) and tools each step offers. */
export const PHASES = [
  { step: 3, label: "Where", keys: ["trends", "where"], tools: ["qloo_trends", "qloo_where_popular"] as AllowedTool[], promptSteps: [1, 2] },
  { step: 4, label: "Who", keys: ["who", "tags", "podcasts", "shows", "brands"], tools: ["qloo_audience_demographics", "qloo_entity_tags", "qloo_recommend"] as AllowedTool[], promptSteps: [3, 4, 5] },
  { step: 5, label: "Gap", keys: ["gap"], tools: ["qloo_compare_audiences"] as AllowedTool[], promptSteps: [6] },
] as const;
export type Phase = (typeof PHASES)[number];

export const MAX_RIVALS = 2;

/** What the website flow needs from the run (structural, so run.ts and this file do not import each other). */
export interface RunCtx {
  runId: string;
  project: ProjectRow;
  log(kind: string, text: string): void;
  ask(req: ChatRequest): Promise<ChatResult>;
  qlooCall(tool: AllowedTool, args: Record<string, unknown>, opts: { taskId: number | null; competitor: string | null; filledBy: "llm" | "code" }): Promise<{ cite: string; res: SlimResult }>;
  auditSink(source: string): Parameters<typeof gateToolCall>[2];
}

export function step(st: RunCtx, n: number, s: "working" | "done" | "skipped" | "failed", note = ""): void {
  st.log("step", JSON.stringify({ n, s, note: clip(note, 160) }));
}

/** Step 1: read the homepage, name the brand, check it in Qloo. */
export async function readWebsite(st: RunCtx): Promise<SiteInfo> {
  step(st, 1, "working");
  const url = st.project.landing_url ?? "";
  st.log("agent", `opening ${new URL(url).hostname.replace(/^www\./, "")}`);
  const site = await readSite(url);
  st.log("agent", site.ok ? `reading what the homepage says: "${clip(site.title || site.name, 70)}"` : `could not read the page (${site.note}); using the domain name`);
  st.log("site", JSON.stringify(site));
  if (!entities.forProject(st.project.id).some((e) => e.role === "brand")) entities.add(st.project.id, "brand", site.name);
  step(st, 1, "done", site.ok ? clip(site.title || site.name, 120) : `${site.name} · ${site.note}`);
  return site;
}

/** Step 2 starts by finding the brand itself in Qloo (its fans are the signal for "brands they also like"). */
async function lookUpBrand(st: RunCtx): Promise<void> {
  let brand = entities.forProject(st.project.id).find((e) => e.role === "brand");
  if (!brand) return;
  if (brand.status !== "found") {
    st.log("agent", `looking up ${brand.name} in Qloo's taste graph`);
    const g = gateToolCall("qloo_describe", { entity: brand.name, type: "brand" }, st.auditSink("code"));
    if (g.ok) {
      const { res } = await st.qlooCall("qloo_describe", g.args, { taskId: null, competitor: null, filledBy: "code" });
      const out = resolveEntity(brand.id, brand.name, res);
      // The site told us the brand, so an exact-name candidate is the right one.
      const exact = out.candidates.find((c) => c.name.toLowerCase() === brand!.name.toLowerCase());
      if (out.status === "ambiguous" && exact) entities.setResolution(brand.id, { status: "found", qloo_id: exact.id, qloo_type: exact.type ?? "urn:entity:brand", qloo_name: exact.name });
    }
    brand = entities.byId(brand.id)!;
  }
}

const pickSchema = z.object({ competitors: z.array(z.string().min(1).max(80)).max(6), proxies: z.array(z.string().min(1).max(80)).max(6).optional() });

function parseLoose(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(m ? m[0] : text);
  } catch {
    return null;
  }
}

/**
 * Step 2: find the competitors. Qloo proposes brands the brand's fans also like; the Planner picks the direct
 * competitors among them (it may also name a well-known rival, which is then checked in Qloo). Without a usable
 * LLM answer the top Qloo brands are used, labelled.
 */
export async function findCompetitors(st: RunCtx, site: SiteInfo): Promise<EntityRow[]> {
  step(st, 2, "working");
  await lookUpBrand(st);
  const list = entities.forProject(st.project.id);
  const existing = list.filter((e) => e.role === "competitor");
  if (existing.length) {
    step(st, 2, "done", `${existing.length} competitor${existing.length > 1 ? "s" : ""} already set`);
    return existing;
  }
  const brand = list.find((e) => e.role === "brand")!;
  const candidates: Array<{ id: string; name: string }> = [];
  if (brand.status === "found" && brand.qloo_id) {
    st.log("agent", `asking Qloo which brands ${brand.name}'s fans also like`);
    const g = gateToolCall("qloo_recommend", { target_type: "brand", signals: [brand.qloo_id], limit: 15 }, st.auditSink("code"));
    if (g.ok) {
      const { res } = await st.qlooCall("qloo_recommend", g.args, { taskId: null, competitor: null, filledBy: "code" });
      for (const it of ((res.data.items as Array<{ id?: string; name?: string }>) ?? [])) {
        if (it.id && it.name && it.name.toLowerCase() !== brand.name.toLowerCase()) candidates.push({ id: it.id, name: it.name });
      }
    }
  }
  st.log("agent", "choosing the direct competitors");
  const res = await st.ask({ purpose: "market", json: true, maxTokens: 600, messages: marketMessages({ brand: brand.name, site: `${site.title} ${site.description}`, candidates: candidates.map((c) => c.name) }) });
  let names: string[] = [];
  let proxies: string[] = [];
  let source = "top Qloo brands (the agent's answer was not usable)";
  if (!res.empty) {
    const parsed = pickSchema.safeParse(parseLoose(res.content));
    if (parsed.success && parsed.data.competitors.length) {
      names = parsed.data.competitors;
      proxies = parsed.data.proxies ?? [];
      source = "picked by the agent";
    }
  }
  if (!names.length) names = candidates.slice(0, MAX_RIVALS).map((c) => c.name);

  const picked: EntityRow[] = [];
  await addFound(st, brand, names, candidates, picked);
  let kind: "direct" | "proxy" = "direct";
  if (!picked.length && proxies.length) {
    // No direct competitor is in Qloo (common for small or B2B brands): profile big brands with the same buyers.
    st.log("agent", `profiling big brands ${brand.name}'s buyers also love`);
    await addFound(st, brand, proxies, candidates, picked);
    if (picked.length) kind = "proxy";
  }
  if (!picked.length) {
    // Last resort: the first Qloo candidates, so the flow can go on.
    for (const c of candidates.slice(0, MAX_RIVALS)) {
      const e = entities.add(st.project.id, "competitor", c.name);
      entities.setResolution(e.id, { status: "found", qloo_id: c.id, qloo_type: "urn:entity:brand", qloo_name: c.name });
      picked.push(entities.byId(e.id)!);
    }
    if (picked.length) source = "top Qloo brands";
  }
  st.log("rivals", JSON.stringify({ source, pool: candidates.length, kind }));
  if (!picked.length) {
    step(st, 2, "failed", "nothing to compare in Qloo");
    throw new Error(`The agent could not find a competitor with enough audience data for ${brand.name} yet. Add a well-known competitor by hand on the project page.`);
  }
  step(st, 2, "done", kind === "proxy" ? `audience brands: ${picked.map((p) => p.name).join(", ")}` : picked.map((p) => p.name).join(", "));
  return picked;
}

/** Add each name that Qloo knows as a competitor entity, up to MAX_RIVALS in total. */
async function addFound(st: RunCtx, brand: EntityRow, names: string[], candidates: Array<{ id: string; name: string }>, picked: EntityRow[]): Promise<void> {
  for (const raw of names.slice(0, 6)) {
    if (picked.length >= MAX_RIVALS) break;
    const name = clip(raw.trim(), 60);
    if (!name || name.toLowerCase() === brand.name.toLowerCase() || picked.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue;
    const e = entities.add(st.project.id, "competitor", name);
    const known = candidates.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (known) {
      entities.setResolution(e.id, { status: "found", qloo_id: known.id, qloo_type: "urn:entity:brand", qloo_name: known.name });
    } else {
      st.log("agent", `checking ${name} in Qloo`);
      const g = gateToolCall("qloo_describe", { entity: name, type: "brand" }, st.auditSink("code"));
      if (g.ok) {
        const { res: d } = await st.qlooCall("qloo_describe", g.args, { taskId: null, competitor: name, filledBy: "code" });
        const out = resolveEntity(e.id, name, d);
        const exact = out.candidates.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (out.status === "ambiguous" && exact) entities.setResolution(e.id, { status: "found", qloo_id: exact.id, qloo_type: exact.type ?? "urn:entity:brand", qloo_name: exact.name });
      }
    }
    const row = entities.byId(e.id)!;
    if (row.status === "found") picked.push(row);
    else {
      entities.remove(e.id);
      st.log("agent", `${name}: too little audience data, trying the next one`);
    }
  }
}

/** Steps and their latest status for a run, read back from the "step" log rows. */
export function stepStates(runId: string): Array<{ n: number; title: string; status: "queued" | "working" | "done" | "skipped" | "failed"; note: string }> {
  const rows = runLog.forRun(runId);
  const state = new Map<number, { s: string; note: string }>();
  for (const r of rows) {
    if (r.kind !== "step") continue;
    try {
      const v = JSON.parse(r.text) as { n: number; s: string; note?: string };
      state.set(v.n, { s: v.s, note: v.note ?? "" });
    } catch {
      /* ignore */
    }
  }
  return WIZ_STEPS.map((s) => {
    const v = state.get(s.n);
    return { n: s.n, title: s.title, status: (v?.s as "working" | "done" | "skipped" | "failed") ?? "queued", note: v?.note ?? "" };
  });
}
