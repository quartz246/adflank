import { calls, campaignSettings, entities, packages, runs, type ProjectRow } from "@/lib/db/repo";
import type { AttackPackage } from "@/lib/types/attack";
import { safeJson } from "@/lib/agent/views";
import { buildSegments, POOL_SEGMENTS } from "./segments";
import { planCampaigns, restoreSettings } from "./plan";
import { VARIANTS } from "@/lib/ads/creative/formats";

/**
 * One project as the "My campaigns" page shows it: the brand, its rivals, the latest run, and the owner's saved campaign
 * plan (the same planCampaigns the campaign screen uses, so the numbers match).
 */
export function projectSummary(p: ProjectRow) {
  const list = runs.forProject(p.id, 20);
  const last = list[0];
  const done = list.find((r) => r.status === "done");
  const ents = entities.forProject(p.id);
  const brand = ents.find((e) => e.role === "brand")?.name ?? p.name;
  const rivals = ents.filter((e) => e.role === "competitor" && e.status === "found").map((e) => e.name);
  let domain = p.name;
  try {
    if (p.landing_url) domain = new URL(p.landing_url).hostname.replace(/^www\./, "");
  } catch {
    /* keep the project name */
  }
  const base = { id: p.id, brand, domain, rivals, status: last?.status ?? null, at: last?.started_at ?? p.created_at, scheduled: p.schedule_daily === 1 };
  if (!done) return { ...base, plan: null };
  const pkgs = packages.forRun(done.id).map((r) => JSON.parse(r.package_json) as AttackPackage);
  if (!pkgs.length) return { ...base, plan: null };
  const pool = buildSegments(pkgs, brand, undefined, undefined, POOL_SEGMENTS);
  const s = restoreSettings(safeJson(campaignSettings.get(p.id)?.json ?? null), pool);
  const plan = planCampaigns(pool, s);
  return {
    ...base,
    plan: {
      campaigns: plan.live.length,
      budget: plan.budget,
      reach: plan.total,
      cities: plan.cities,
      tastes: plan.live.slice(0, 4).map((c) => c.s.taste.label),
      items: plan.live.map((c) => ({ rival: c.s.comp, taste: c.s.taste.label, city: c.places[0]?.label ?? "", band: c.s.demo.band, gender: c.s.demo.gender, reach: c.reach })),
      thumbs: plan.live.slice(0, 4).map((c) => ({ n: c.n, v: s.picked[String(c.n)] ?? VARIANTS[c.n % VARIANTS.length] })),
      platforms: s.plats,
      launched: s.launched,
      qloo: calls.forRun(done.id).filter((c) => c.ok === 1).length,
      finishedAt: done.finished_at,
    },
  };
}
export type ProjectSummary = ReturnType<typeof projectSummary>;
