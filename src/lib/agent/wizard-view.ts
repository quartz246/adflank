import { isGuestUser } from "@/lib/auth/session";
import { calls, entities, packages, runLog, runs, type CallRow, type ProjectRow, type UserRow } from "@/lib/db/repo";
import type { AttackPackage, PlatformTemplate } from "@/lib/types/attack";
import { generateTemplates } from "@/lib/ads";
import { sanitizeDeep } from "@/lib/util/sanitize";
import { cleanLandingUrl } from "@/lib/util/url";
import type { SiteInfo } from "@/lib/site/read";
import { composePackage } from "./compose";
import { stepStates } from "./wizard";
import { safeJson } from "./views";
import { agentLine, TERMINAL_KINDS, TOOL_WORDS } from "./words";

export interface HeatCell { lat: number; lon: number; a: number; near?: string; region?: string; cite: string }

/** The raw heat cells of the competitor's latest where_popular call (Qloo returns coordinates; the fan map plots them). */
function heatCells(rows: CallRow[], competitor: string): HeatCell[] {
  const c = [...rows].reverse().find((x) => x.tool === "qloo_where_popular" && x.competitor === competitor && x.ok === 1 && x.result_json);
  if (!c) return [];
  const places = (safeJson(c.result_json!) as { places?: Array<Record<string, unknown>> } | null)?.places ?? [];
  const out: HeatCell[] = [];
  for (const p of places) {
    const lat = Number(p.lat), lon = Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({ lat, lon, a: Number(p.affinity ?? 0), near: typeof p.near === "string" ? p.near : undefined, region: typeof p.region === "string" ? p.region : undefined, cite: c.cite_id });
  }
  return out.slice(0, 20);
}

/** The website-flow page state for a project's latest run (sanitised for the browser). */
export function wizardView(project: ProjectRow, user: UserRow) {
  const run = runs.lastForProject(project.id);
  const ents = entities.forProject(project.id);
  const brand = ents.find((e) => e.role === "brand");
  const rivals = ents.filter((e) => e.role === "competitor" && e.status === "found");
  if (!run) return { project: { id: project.id, name: project.name, url: cleanLandingUrl(project.landing_url) }, run: null };

  const logs = runLog.forRun(run.id);
  const lastOf = (kind: string) => safeJson([...logs].reverse().find((l) => l.kind === kind)?.text ?? null);
  const site = lastOf("site") as SiteInfo | null;
  const market = lastOf("rivals") as { source: string; pool: number; kind?: "direct" | "proxy" } | null;

  const steps = stepStates(run.id);
  if (run.status === "done" && steps.every((s) => s.status === "queued")) for (const s of steps) s.status = "done";
  if (run.status === "failed") {
    const cur = steps.find((s) => s.status === "failed") ?? steps.find((s) => s.status === "working") ?? steps.find((s) => s.status === "queued");
    if (cur) {
      cur.status = "failed";
      cur.note = run.error ?? "failed";
    }
  }
  // Not started yet = queued behind other runs (a started run always writes "Run started" first).
  const queued = run.status === "running" && logs.length === 0;
  const ahead = queued ? Math.max(1, runs.active().filter((r) => r.id !== run.id && r.started_at < run.started_at && runLog.forRun(r.id).length === 0).length + 1) : 0;

  const runCalls = calls.forRun(run.id);
  const stored = packages.forRun(run.id);
  const landing = cleanLandingUrl(project.landing_url);
  const comps = rivals.map((c) => {
    const row = stored.find((p) => p.competitor === c.name);
    let pkg: AttackPackage;
    let templates: PlatformTemplate[] = [];
    if (row) {
      pkg = JSON.parse(row.package_json) as AttackPackage;
      try {
        templates = generateTemplates(pkg, landing ? { landingUrl: landing } : {});
      } catch {
        templates = [];
      }
    } else {
      pkg = composePackage({ runId: run.id, project, brand, competitor: c, calls: runCalls.filter((x) => x.competitor === c.name || x.competitor === null), projectEntities: ents });
    }
    return { name: c.name, qlooName: c.qloo_name, done: Boolean(row), calls: runCalls.filter((x) => x.competitor === c.name).length, pkg, templates, heat: heatCells(runCalls, c.name) };
  });

  const terminal = [
    ...logs.filter((l) => TERMINAL_KINDS.has(l.kind)).map((l) => ({ at: l.at, kind: l.kind, text: l.kind === "llm" ? agentLine(l.text) : l.text })),
    ...runCalls.map((c) => ({ at: c.at, kind: c.ok ? "call" : "callfail", text: `${TOOL_WORDS[c.tool] ?? c.tool} ${c.competitor ?? brand?.name ?? ""}`.trim() })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-40);

  const view = sanitizeDeep({
    project: { id: project.id, name: project.name, country: project.country_code, scheduled: project.schedule_daily === 1 },
    run: { id: run.id, status: run.status, error: run.error, model: run.llm_model_used, startedAt: run.started_at, finishedAt: run.finished_at, qlooMode: run.qloo_mode },
    ahead,
    steps,
    site,
    market,
    brand: brand ? { name: brand.name, qlooName: brand.qloo_name, found: brand.status === "found" } : null,
    comps,
    terminal,
    qlooCalls: runCalls.filter((c) => c.ok).length,
    guest: isGuestUser(user),
  });
  // Restore the validated public URL (sanitizeText would show it as "[url]").
  return { ...view, project: { ...view.project, url: landing }, site: view.site ? { ...view.site, url: landing ?? "" } : null };
}
