import type { AttackPackage } from "@/lib/types/attack";
import { templateCopy, type CopyFacts } from "@/lib/ads/creative/copywriter";
import { possessive } from "@/lib/ads/copy";

/**
 * The top ad categories of a campaign: each one a different taste aimed at a different demographic, across all the
 * competitors' fans. Every value comes from the stored Qloo calls (gap/taste tags, where_popular, audience
 * demographics, recommendations); only the ad wording is written here, and it never names a competitor.
 */
export type Gender = "women" | "men" | "everyone";
export interface Demo { band: string; gender: Gender; ageIndex: number; genderIndex: number; cite?: string }
export interface Segment {
  id: string;
  comp: string;
  compIndex: number;
  /** rank: 1-based position in Qloo's list (gap rows by delta, taste tags by affinity); of: list length. */
  taste: { label: string; score: number; gap: boolean; yours?: number; cite?: string; rank?: number; of?: number };
  place: { label: string; score: number; cite?: string; rank?: number; of?: number };
  media?: { label: string; kind: string; cite?: string };
  demo: Demo;
  name: string;
  sub: string;
  /** Deterministic copy (lib/ads/creative/copywriter); the campaign copy endpoint may replace it with filtered GLM copy. */
  ad: { primary: string; headline: string; hook: string; sub: string; tiktok: string; youtube: { title: string; line: string } };
  /** Other tastes of the same fans, strongest first (used by the campaign levers). */
  related: Array<{ label: string; score: number }>;
  places: Array<{ label: string; score: number }>;
}

export const MAX_SEGMENTS = 5;
/** The wider pool the agency draws on as the budget grows or a segment is replaced (the first MAX_SEGMENTS are the same). */
export const POOL_SEGMENTS = 12;
const BAND_LABEL: Record<string, string> = { "18-24": "18–24", "25-34": "25–34", "35-44": "35–44", "45-54": "45–54", "55+": "55+" };

export function demoLabel(d: Demo): string {
  const who = d.gender === "women" ? "Women" : d.gender === "men" ? "Men" : "People";
  return `${who} ${BAND_LABEL[d.band] ?? d.band}`;
}

function demosOf(p: AttackPackage): Demo[] {
  const f = p.who.female ?? 0;
  const m = p.who.male ?? 0;
  const gender: Gender = f - m > 0.08 ? "women" : m - f > 0.08 ? "men" : "everyone";
  const sorted = [...p.who.ages].sort((a, b) => b.share - a.share);
  // Qloo shares are indices (negative = under-indexed); keep the over-indexed bands, else the least under-indexed one.
  const bands = sorted.filter((b) => b.share > 0).length ? sorted.filter((b) => b.share > 0) : sorted.slice(0, 1);
  const list = bands.length ? bands : [{ band: "25-34" as const, share: 0 }];
  return list.map((b) => ({ band: b.band, gender, ageIndex: b.share, genderIndex: Math.round((f - m) * 100) / 100, cite: p.who.cite }));
}

/**
 * Qloo tags too generic to carry an ad ("Media", "Stylish", "Innovation"), or that describe content rather than a taste
 * ("female protagonist", "Politician"). Segments skip them while better tags exist.
 */
const GENERIC_TAGS = new Set([
  "media", "entertainment", "accessories", "stylish", "innovation", "innovative", "classic", "versatile", "modern", "quality",
  "style", "fashion", "lifestyle", "brand", "brands", "shopping", "retail", "popular", "trendy", "casual", "comfort", "comfortable",
  "female protagonist", "male protagonist", "politician", "politics", "folk", "celebrity", "celebrities", "news", "business",
  "technology", "design", "food", "music", "film", "tv", "television", "books", "sports", "travel", "health", "family",
  // plot keywords Qloo attaches to shows and books: they describe content, and read as menace in an ad
  "murder", "police", "crime", "death", "violence", "war", "killer", "serial killer", "revenge", "family relationships", "relationships",
]);
export function adWorthy(label: string): boolean {
  const l = label.trim().toLowerCase();
  return l.length >= 3 && !GENERIC_TAGS.has(l) && !/^urn:/.test(l);
}

export function buildSegments(pkgs: AttackPackage[], brand: string, about?: string, title?: string, max = MAX_SEGMENTS): Segment[] {
  const competitors = pkgs.map((p) => p.competitor.name);
  const per = pkgs.map((p, ci) => {
    const cap = (x: string) => x.replace(/(^|[\s-])([a-z])/g, (_, b: string, c: string) => b + c.toUpperCase());
    const gaps = [...p.gap].sort((a, b) => b.delta - a.delta);
    const ints = [...p.interests].sort((a, b) => b.affinity - a.affinity);
    const all = [...gaps.map((g, i) => ({ label: cap(g.label), score: g.theirs, gap: true, yours: g.yours, cite: g.cite, rank: i + 1, of: gaps.length })), ...ints.map((t, i) => ({ label: cap(t.name), score: t.affinity, gap: false, cite: t.cite, rank: i + 1, of: ints.length }))];
    const seen = new Set<string>();
    const uniq = all.filter((t) => !seen.has(t.label.toLowerCase()) && seen.add(t.label.toLowerCase()));
    const good = uniq.filter((t) => adWorthy(t.label));
    // Gap tags first (the switching hook), then defining taste tags; generic tags only when nothing better exists.
    const tastes = good.length ? good : uniq;
    const places = p.where.filter((w) => w.city && !/^near\s/.test(w.city)).map((w, i, a) => ({ label: w.city!, score: w.score, cite: w.cite, rank: i + 1, of: a.length }));
    const media = p.creators.filter((c) => c.kind === "podcast" || c.kind === "tv_show").map((c) => ({ label: c.name, kind: c.kind, cite: c.cite }));
    const related = p.interests.map((t) => ({ label: t.name, score: t.affinity }));
    return { p, ci, tastes, places: places.length ? places : [{ label: p.locale.countryCodes[0] ?? "US", score: 1 }], media, demos: demosOf(p), related };
  });
  const out: Segment[] = [];
  const used = new Set<string>();
  for (let r = 0; out.length < max && r < max * 4; r++) {
    const c = per[r % per.length];
    if (!c) break;
    const k = Math.floor(r / per.length);
    const taste = c.tastes.find((t, i) => i >= k && !used.has(t.label.toLowerCase())) ?? c.tastes.find((t) => !used.has(t.label.toLowerCase()));
    if (!taste) continue;
    used.add(taste.label.toLowerCase());
    const place = c.places[k % c.places.length];
    const demo = c.demos[k % c.demos.length];
    const media = c.media.length ? c.media[k % c.media.length] : undefined;
    const comp = c.p.competitor.name;
    const facts: CopyFacts = { id: `s${out.length}`, brand, about, title, taste: taste.label, gap: taste.gap, place: place.label, media: media?.label, audience: demoLabel(demo), competitors, index: out.length };
    const copy = templateCopy(facts);
    out.push({
      id: facts.id,
      comp,
      compIndex: c.ci,
      taste,
      place,
      media,
      demo,
      name: `${demoLabel(demo)} into ${taste.label}`,
      sub: `${place.label} · people like ${possessive(comp)} customers`,
      ad: {
        primary: copy.primary,
        headline: copy.headline,
        hook: copy.hook,
        sub: copy.sub,
        tiktok: copy.tiktok,
        youtube: { title: copy.headline, line: `${place.label}${media ? ` · for ${media.label.replace(/^the\s+/i, "")} fans` : ""}` },
      },
      related: c.related.filter((t) => t.label.toLowerCase() !== taste.label.toLowerCase()),
      places: c.places,
    });
  }
  return out;
}

export function hue(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/**
 * Estimated reach (a model, not platform data): metro population x adult share x the demographic's share x a taste
 * share scaled by Qloo's affinity score. Metro populations are rounded public census figures; unknown places use 1M.
 * Real audience sizes come from the ad platforms' estimators once an ad account is connected.
 */
const METRO_M: Record<string, number> = {
  "new york": 19.8, brooklyn: 2.6, manhattan: 1.6, "los angeles": 13, chicago: 9.4, dallas: 7.6, houston: 7.1, washington: 6.3,
  philadelphia: 6.2, miami: 6.1, atlanta: 6.1, boston: 4.9, phoenix: 4.8, "san francisco": 4.7, oakland: 4.7, detroit: 4.4,
  seattle: 4, minneapolis: 3.7, "san diego": 3.3, tampa: 3.2, denver: 3, baltimore: 2.8, "st. louis": 2.8, orlando: 2.7,
  charlotte: 2.7, "san antonio": 2.6, portland: 2.5, sacramento: 2.4, pittsburgh: 2.4, austin: 2.3, "las vegas": 2.3,
  cincinnati: 2.3, "kansas city": 2.2, columbus: 2.1, indianapolis: 2.1, cleveland: 2.1, "san jose": 2, nashville: 2,
  "salt lake city": 1.3, "new orleans": 1.3, honolulu: 1, raleigh: 1.4, richmond: 1.3, london: 9.5, toronto: 6.2, paris: 11,
  berlin: 3.6, sydney: 5.3, melbourne: 5, vancouver: 2.6, montreal: 4.3, manchester: 2.8, dublin: 1.4,
};
const AGE_SHARE: Record<string, number> = { "18-24": 0.12, "25-34": 0.17, "35-44": 0.16, "45-54": 0.15, "55+": 0.34 };

export function metroPeople(place: string): number {
  return (METRO_M[place.trim().toLowerCase()] ?? 1) * 1_000_000;
}

export function estimateReach(seg: Pick<Segment, "demo" | "taste">, places: Array<{ label: string }>): number {
  const demo = (AGE_SHARE[seg.demo.band] ?? 0.15) * (seg.demo.gender === "everyone" ? 1 : 0.5);
  const tasteShare = 0.03 + 0.07 * Math.max(0, Math.min(1, seg.taste.score));
  const total = places.reduce((n, p) => n + metroPeople(p.label) * 0.78 * demo * tasteShare, 0);
  return Math.round(total / 1000) * 1000;
}

export function fmtReach(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.max(1, Math.round(n / 1000))}K`;
}
/**
 * Weekly reach for a daily budget (a model, not platform data): budget x 7 buys impressions at an assumed blended CPM,
 * people see an ad about FREQ_EST times, and reach saturates toward the segment's size (estimateReach) as spend grows.
 */
export const CPM_EST = 9;
export const FREQ_EST = 2;
export function weeklyReach(audience: number, dailyBudget: number): number {
  if (audience <= 0 || dailyBudget <= 0) return 0;
  const impressions = ((dailyBudget * 7) / CPM_EST) * 1000;
  return Math.round(audience * (1 - Math.exp(-impressions / (audience * FREQ_EST))));
}
export const BUDGET_NOTE = `Estimate: daily budget × 7 at a ~$${CPM_EST} CPM, about ${FREQ_EST} views per person, capped by each segment's size (metro adults × age/gender × taste share). The budget is split by segment size. Real reach comes from the ad platforms once your accounts are connected.`;
export const REACH_NOTE = "Estimate: metro adults × age/gender share × taste share scaled by Qloo affinity. Real reach comes from the ad platforms once connected.";
