import { createHash } from "node:crypto";
import type { ProjectRow, UserRow } from "@/lib/db/repo";
import type { AttackPackage } from "@/lib/types/attack";
import { wizardView } from "@/lib/agent/wizard-view";
import { buildSegments, demoLabel, MAX_SEGMENTS, POOL_SEGMENTS, type Segment } from "@/lib/campaign/segments";
import { getLlm } from "@/lib/llm";
import { brandKit, type BrandKit } from "./brand";
import { copyMessages, mergeGlmCopy, type CopyFacts, type CreativeCopy } from "./copywriter";

/**
 * Server-side campaign creative state for a project's latest finished run: the ad categories (segments), the brand kit
 * read from the brand's own site, and the copy (deterministic first; GLM copy once it has answered and passed the
 * filter). GLM copy is requested once per run and cached in memory, so every image and mockup of a run shows one copy set.
 */
export interface CampaignCreative {
  runId: string;
  brand: string;
  about?: string;
  segments: Segment[];
  copy: Record<string, CreativeCopy>;
  /** Changes when the copy changes (used to bust cached images). */
  rev: string;
  source: "glm" | "template";
}

// glm-5.3-flash always reasons first: about 45 s for 2 ads, more for 5. The job runs in the background; the page shows the
// template copy until it lands (the client polls the copy endpoint while `pending`).
const COPY_TIMEOUT_MS = 110_000;
interface GlmEntry { job: Promise<Record<string, CreativeCopy> | null>; done: boolean; value: Record<string, CreativeCopy> | null }
const glmCache = new Map<string, GlmEntry>();

function factsOf(segs: Segment[], brand: string, about: string | undefined, title: string | undefined, competitors: string[]): CopyFacts[] {
  return segs.map((s, i) => ({ id: s.id, brand, about, title, taste: s.taste.label, gap: s.taste.gap, place: s.place.label, media: s.media?.label, audience: demoLabel(s.demo), competitors, index: i }));
}

function templateSet(segs: Segment[]): Record<string, CreativeCopy> {
  return Object.fromEntries(segs.map((s) => [s.id, { hook: s.ad.hook, sub: s.ad.sub, primary: s.ad.primary, headline: s.ad.headline, tiktok: s.ad.tiktok, source: "template" as const }]));
}

export function revOf(copy: Record<string, CreativeCopy>): string {
  return createHash("sha256").update(JSON.stringify(copy)).digest("hex").slice(0, 10);
}

async function askGlm(facts: CopyFacts[], brand: string, about: string | undefined): Promise<Record<string, CreativeCopy> | null> {
  const llm = getLlm();
  if (llm.mode !== "live") return null;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), COPY_TIMEOUT_MS));
  const res = await Promise.race([llm.chat({ purpose: "copy", messages: copyMessages(brand, about, facts), json: true, maxTokens: 2500 }).catch(() => null), timeout]);
  if (!res || res.empty) return null;
  const merged = mergeGlmCopy(res.content, facts);
  return merged.used > 0 ? merged.copy : null;
}

export function loadCampaign(project: ProjectRow, user: UserRow): { view: ReturnType<typeof wizardView>; pkgs: AttackPackage[]; brand: string; about?: string; title?: string; siteUrl: string | null; runId: string } | null {
  const v = wizardView(project, user);
  if (!("comps" in v) || !v.run || !v.comps.length || !v.comps.every((c) => c.done)) return null;
  const pkgs = v.comps.map((c) => c.pkg as AttackPackage);
  const brand = v.brand?.name ?? project.name;
  const about = v.site?.description || undefined;
  const title = v.site?.title || undefined;
  return { view: v, pkgs, brand, about, title, siteUrl: v.project.url ?? v.site?.url ?? null, runId: v.run.id };
}

/**
 * The campaign's creatives. `waitMs` bounds how long to wait for GLM copy (0 = return the deterministic copy now and let
 * GLM finish in the background; the copy endpoint waits for it).
 */
export async function campaignCreative(project: ProjectRow, user: UserRow, waitMs: number): Promise<{ c: CampaignCreative; kit: Promise<BrandKit>; pending: boolean } | null> {
  const loaded = loadCampaign(project, user);
  if (!loaded) return null;
  const { pkgs, brand, about, title, siteUrl, runId } = loaded;
  // The whole pool gets images; GLM writes the first MAX_SEGMENTS (its answer time grows with each ad), the rule-based
  // writer the rest.
  const segments = buildSegments(pkgs, brand, about, title, POOL_SEGMENTS);
  const lead = segments.slice(0, MAX_SEGMENTS);
  const competitors = pkgs.map((p) => p.competitor.name);
  const key = `${runId}|${lead.map((s) => s.id + s.taste.label + s.place.label).join(",")}`;
  let entry = glmCache.get(key);
  if (!entry) {
    const e: GlmEntry = { job: Promise.resolve(null), done: false, value: null };
    e.job = askGlm(factsOf(lead, brand, about, title, competitors), brand, about).catch(() => null).then((v) => {
      e.done = true;
      e.value = v;
      return v;
    });
    glmCache.set(key, (entry = e));
    if (glmCache.size > 300) glmCache.delete(glmCache.keys().next().value as string);
  }
  const glm = entry.done ? entry.value : waitMs > 0 ? await Promise.race([entry.job, new Promise<null>((r) => setTimeout(() => r(null), waitMs))]) : null;
  const copy = glm ? { ...templateSet(segments), ...glm } : templateSet(segments);
  const kit = brandKit(brand, siteUrl);
  return { c: { runId, brand, about, segments, copy, rev: revOf(copy), source: glm ? "glm" : "template" }, kit, pending: !entry.done };
}
