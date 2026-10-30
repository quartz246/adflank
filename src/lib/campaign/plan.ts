import { z } from "zod";
import { adWorthy, estimateReach, weeklyReach, type Segment } from "./segments";

/**
 * The campaign plan the owner tunes on the campaign screen: daily budget, which segments run, the Qloo levers, picked
 * designs and the launch (preview) flag. Shared by the campaign screen and the "My campaigns" page, and stored per project
 * (campaign_settings) so the choices come back on the next visit.
 */

/** Budget thresholds and how many campaigns (segments) each one runs: more budget opens more cities and tastes. */
export const BUDGETS = [10, 25, 50, 100, 250, 500, 1000];
export const RUNS = [2, 3, 4, 5, 7, 9, 12];
/** The slider glides on a log scale, $10 to $1,000 a day; positions 0..SLIDER map to round dollar amounts. */
export const SLIDER = 1000;
export const budgetAt = (pos: number) => {
  const v = 10 * 100 ** (pos / SLIDER);
  return v < 100 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10;
};
export const runsFor = (budget: number) => RUNS[BUDGETS.reduce((at, b, n) => (budget >= b ? n : at), 0)];

export const BANDS = ["18-24", "25-34", "35-44", "45-54", "55+"] as const;
export const MATCH = [
  { id: "strict", label: "Strict", min: 0.8, note: "the segment's own taste only" },
  { id: "balanced", label: "Balanced", min: 0.6, note: "plus related tastes these fans score 60+ on in Qloo" },
  { id: "broad", label: "Broad", min: 0.35, note: "plus related tastes they score 35+ on" },
] as const;
export const PLATFORMS = ["meta", "tiktok", "google"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLAT_LABEL: Record<Platform, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };

const idx = z.number().int().min(0).max(19);
export const settingsSchema = z.object({
  v: z.literal(1),
  pos: z.number().int().min(0).max(SLIDER),
  active: z.array(idx).min(1).max(12),
  retired: z.array(idx).max(20),
  match: z.enum(["strict", "balanced", "broad"]),
  perSet: z.number().int().min(1).max(4),
  ages: z.array(z.enum(BANDS)).max(5),
  plats: z.array(z.enum(PLATFORMS)).max(3),
  picked: z.record(z.string().regex(/^\d{1,2}$/), z.enum(["bold", "editorial", "type"])),
  launched: z.boolean(),
}).strict();
export type CampaignSettings = z.infer<typeof settingsSchema>;

export function defaultSettings(pool: Segment[]): CampaignSettings {
  const pos = SLIDER / 2; // $100 a day
  return {
    v: 1,
    pos,
    active: pool.slice(0, runsFor(budgetAt(pos))).map((_, n) => n),
    retired: [],
    match: "balanced",
    perSet: 1,
    ages: [...new Set(pool.map((x) => x.demo.band))].filter((b): b is (typeof BANDS)[number] => (BANDS as readonly string[]).includes(b)),
    plats: [...PLATFORMS],
    picked: {},
    launched: false,
  };
}

/** Stored settings checked against the current pool (a newer run can have fewer segments); falls back to the defaults. */
export function restoreSettings(raw: unknown, pool: Segment[]): CampaignSettings {
  const base = defaultSettings(pool);
  const p = settingsSchema.safeParse(raw);
  if (!p.success) return base;
  const s = p.data;
  const active = [...new Set(s.active.filter((n) => n < pool.length))];
  return { ...s, active: active.length ? active : base.active, retired: s.retired.filter((n) => n < pool.length) };
}

/** The running plan: each active segment with its targeting under the levers, its audience size and weekly reach. */
export function planCampaigns(pool: Segment[], s: Pick<CampaignSettings, "pos" | "active" | "match" | "perSet" | "ages">) {
  const minMatch = MATCH.find((m) => m.id === s.match)!.min;
  const budget = budgetAt(s.pos);
  const campaigns = s.active.filter((n) => pool[n]).map((n, pos) => {
    const seg = pool[n];
    const tastes = [seg.taste.label, ...seg.related.filter((t) => t.score >= minMatch && adWorthy(t.label)).slice(0, 4).map((t) => t.label)];
    const places = [seg.place, ...seg.places.filter((p) => p.label !== seg.place.label)].slice(0, s.perSet);
    const on = (s.ages as string[]).includes(seg.demo.band);
    const size = estimateReach({ demo: seg.demo, taste: { ...seg.taste, score: Math.min(1, seg.taste.score + (tastes.length - 1) * 0.08) } }, places);
    return { n, pos, s: seg, tastes, places, on, size, reach: 0 };
  });
  const live = campaigns.filter((c) => c.on);
  const sizeSum = live.reduce((a, c) => a + c.size, 0) || 1;
  for (const c of campaigns) c.reach = c.on ? weeklyReach(c.size, (budget * c.size) / sizeSum) : 0;
  const total = live.reduce((a, c) => a + c.reach, 0);
  const cities = [...new Set(live.flatMap((c) => c.places.map((p) => p.label)))];
  return { campaigns, live, budget, total, cities };
}
