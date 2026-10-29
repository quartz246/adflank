import { z } from "zod";
import type { AgeShare, AttackPackage, Brand, Creator, GapHook, GeoTarget, Interest, ListChange, QlooCitation, RunChanges, Trend, TrendChange } from "@/lib/types/attack";
import type { CallRow, EntityRow, ProjectRow } from "@/lib/db/repo";
import { packages, runs } from "@/lib/db/repo";
import type { ChatRequest, ChatResult } from "@/lib/llm/types";
import { countryLanguage } from "@/lib/geo/cities";
import { copyMessages } from "./prompts";
import { clip, sanitizeText } from "@/lib/util/sanitize";

/**
 * Deterministic composer: builds the AttackPackage from stored Qloo calls only. Every field cites the
 * call it came from (q_<runId>_<n>). The LLM writes nothing here except the copy angles, which are
 * validated against the package's own labels.
 */

type Obj = Record<string, unknown>;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function data(c: CallRow): Obj {
  try {
    return (JSON.parse(c.result_json ?? "{}") as Obj) ?? {};
  } catch {
    return {};
  }
}
function args(c: CallRow): Obj {
  try {
    return JSON.parse(c.args_json) as Obj;
  } catch {
    return {};
  }
}

const brandOf = (e: EntityRow | undefined): Brand => ({ name: e?.name ?? "our brand", qlooId: e?.status === "found" ? (e.qloo_id ?? undefined) : undefined, type: e?.qloo_type ?? undefined });

export const AGE_BANDS: Array<{ band: AgeShare["band"]; keys: string[] }> = [
  { band: "18-24", keys: ["24_and_younger"] },
  { band: "25-34", keys: ["25_to_29", "30_to_34"] },
  { band: "35-44", keys: ["35_to_44"] },
  { band: "45-54", keys: ["45_to_54"] },
  { band: "55+", keys: ["55_and_older"] },
];

function pickLatest(list: CallRow[], tool: string, pred: (c: CallRow) => boolean = () => true): CallRow | undefined {
  return [...list].reverse().find((c) => c.tool === tool && c.ok === 1 && pred(c));
}

/**
 * Venue attributes (dishes, card networks, hotel ratings, price bands: urn:tag:*:place) describe places,
 * not people, so they are not ad-targetable interests.
 */
export function targetableTag(type: unknown): boolean {
  return !(typeof type === "string" && /:place(?::|$)/.test(type));
}

/** Recommend target types in the order the package lists them, and the per-kind and total caps. */
export const CREATOR_ORDER = ["podcast", "tv_show", "artist", "brand"];
export const CREATORS_PER_KIND = 6;
export const MAX_CREATORS = 20;

/** Tag-name cleanup: Qloo names can carry stray whitespace. */
const tagName = (s: unknown) => (typeof s === "string" ? s.trim() : "");

export interface ComposeInput {
  runId: string;
  project: ProjectRow;
  brand: EntityRow | undefined;
  competitor: EntityRow;
  calls: CallRow[];
  /** Every entity of the project (brand and all competitors): never listed as a recommendation or partner. */
  projectEntities?: EntityRow[];
}

export function composePackage(input: ComposeInput): AttackPackage {
  const { runId, project, competitor } = input;
  const compId = competitor.qloo_id ?? "";
  const brandId = input.brand?.qloo_id ?? "";
  const mine = input.calls;
  const citations: Record<string, QlooCitation> = {};
  const cite = (c: CallRow) => {
    citations[c.cite_id] = { id: c.cite_id, tool: c.tool as QlooCitation["tool"], args: args(c), at: c.at, ok: c.ok === 1 };
    return c.cite_id;
  };
  const refersTo = (c: CallRow, key: string) => {
    const a = args(c)[key];
    return Array.isArray(a) ? a.includes(compId) || a.includes(competitor.name) : a === compId || a === competitor.name;
  };

  // where
  const where: GeoTarget[] = [];
  const wc = pickLatest(mine, "qloo_where_popular", (c) => refersTo(c, "entity"));
  if (wc) {
    const id = cite(wc);
    const seen = new Set<string>();
    for (const p of (data(wc).places as Obj[] | undefined) ?? []) {
      const near = typeof p.near === "string" ? p.near : undefined;
      const key = near ?? `${p.lat},${p.lon}`;
      if (seen.has(key)) continue;
      seen.add(key);
      where.push({
        city: near,
        region: near ? (p.region as string | undefined) : `near ${Number(p.lat).toFixed(2)},${Number(p.lon).toFixed(2)}`,
        countryCode: (p.countryCode as string | undefined) ?? project.country_code,
        score: r3(Number(p.affinity ?? 0)),
        cite: id,
      });
    }
  }

  // who
  let who: AttackPackage["who"] = { ages: [], cite: "" };
  const dc = pickLatest(mine, "qloo_audience_demographics", (c) => refersTo(c, "entity"));
  if (dc) {
    const d = data(dc);
    const age = (d.age ?? {}) as Record<string, number | undefined>;
    const gender = (d.gender ?? {}) as Record<string, number | undefined>;
    const ages: AgeShare[] = [];
    for (const b of AGE_BANDS) {
      const vals = b.keys.map((k) => age[k]).filter((v): v is number => typeof v === "number");
      if (vals.length) ages.push({ band: b.band, share: r3(vals.reduce((s, v) => s + v, 0) / vals.length) });
    }
    who = { ages, female: typeof gender.female === "number" ? r3(gender.female) : undefined, male: typeof gender.male === "number" ? r3(gender.male) : undefined, cite: cite(dc) };
  }

  // interests: competitor's taste tags, then their audience-specific comparison tags
  const interests: Interest[] = [];
  const names = new Set<string>();
  const tc = pickLatest(mine, "qloo_entity_tags", (c) => refersTo(c, "entities"));
  if (tc) {
    const id = cite(tc);
    for (const t of (data(tc).tags as Obj[] | undefined) ?? []) {
      const name = tagName(t.name);
      if (!name || names.has(name.toLowerCase()) || !targetableTag(t.type)) continue;
      names.add(name.toLowerCase());
      interests.push({ name, qlooTagId: typeof t.id === "string" ? t.id : undefined, affinity: r3(Number(t.affinity ?? 0)), cite: id });
    }
  }

  // gap: tags specific to the competitor's audience (group_b) that are weak or absent in ours (group_a)
  const gap: GapHook[] = [];
  const cc = pickLatest(mine, "qloo_compare_audiences", (c) => refersTo(c, "group_b"));
  if (cc) {
    const id = cite(cc);
    const d = data(cc);
    const a = ((d.a as Obj[] | undefined) ?? []).map((t) => tagName(t.name).toLowerCase());
    const b = (d.b as Obj[] | undefined) ?? [];
    const strength = (idx: number, len: number) => (idx < 0 || len === 0 ? 0 : r3(1 - idx / len));
    for (let i = 0; i < b.length; i++) {
      const label = tagName(b[i].name);
      if (!label || !targetableTag(b[i].subtype)) continue;
      const theirs = strength(i, b.length);
      const yours = strength(a.indexOf(label.toLowerCase()), a.length);
      const delta = r3(theirs - yours);
      if (delta > 0) gap.push({ label, theirs, yours, delta, cite: id });
    }
    gap.sort((x, y) => y.delta - x.delta);
    gap.splice(8);
    for (const g of gap) {
      if (interests.length >= 14 || names.has(g.label.toLowerCase())) continue;
      names.add(g.label.toLowerCase());
      interests.push({ name: g.label, affinity: g.theirs, cite: id });
    }
  }

  // creators: one qloo_recommend call per target type (latest wins), podcasts first, then TV shows, artists, brands.
  // Each kind keeps its own top CREATORS_PER_KIND so one long list cannot push the others out.
  const creators: Creator[] = [];
  const kindOf = (subtype: unknown, fallback: unknown): Creator["kind"] => {
    const s = String(subtype ?? "").split(":").pop() || String(fallback ?? "");
    return (["podcast", "artist", "tv_show", "brand", "place", "person"] as const).find((k) => k === s) ?? "other";
  };
  const recs = mine.filter((c) => c.tool === "qloo_recommend" && c.ok === 1 && refersTo(c, "signals"));
  const byTarget = new Map<string, CallRow>();
  for (const rc of recs) byTarget.set(String(args(rc).target_type ?? ""), rc);
  const rank = (t: string) => (CREATOR_ORDER.indexOf(t) < 0 ? CREATOR_ORDER.length : CREATOR_ORDER.indexOf(t));
  const own = [competitor, ...(input.brand ? [input.brand] : []), ...(input.projectEntities ?? [])];
  const seenCreators = new Set<string>(own.flatMap((e) => [e.name, e.qloo_name ?? ""]).filter(Boolean).map((n) => n.toLowerCase()));
  const ownIds = new Set(own.map((e) => e.qloo_id).filter((x): x is string => Boolean(x)));
  for (const [target, rc] of [...byTarget.entries()].sort((x, y) => rank(x[0]) - rank(y[0]))) {
    const id = cite(rc);
    let kept = 0;
    for (const it of (data(rc).items as Obj[] | undefined) ?? []) {
      if (kept >= CREATORS_PER_KIND) break;
      const name = tagName(it.name);
      if (!name || seenCreators.has(name.toLowerCase()) || ownIds.has(String(it.id ?? ""))) continue;
      seenCreators.add(name.toLowerCase());
      creators.push({ name, kind: kindOf(it.subtype, target), affinity: r3(Number(it.affinity ?? 0)), cite: id });
      kept++;
    }
  }
  creators.splice(MAX_CREATORS);

  // trends for the brand and the competitor
  const trends: Trend[] = [];
  const trc = pickLatest(mine, "qloo_trends", (c) => refersTo(c, "entities"));
  if (trc) {
    const id = cite(trc);
    for (const s of (data(trc).series as Obj[] | undefined) ?? []) {
      const pts = ((s.points as Obj[] | undefined) ?? []).filter((p) => typeof p.percentile === "number");
      const label = s.id === compId ? competitor.name : s.id === brandId ? (input.brand?.name ?? String(s.name ?? "")) : String(s.name ?? s.input ?? "");
      const latest = pts.length ? r3(Number(pts[pts.length - 1].percentile)) : undefined;
      if (pts.length < 2) {
        // Too few weekly points to measure a change: flat 0 %, and `points` tells the UI it means "no data".
        trends.push({ entity: label, direction: "flat", changePct: 0, points: pts.length, latest, cite: id });
        continue;
      }
      const first = Number(pts[0].percentile);
      const last = Number(pts[pts.length - 1].percentile);
      // A first point of 0 has no relative change: only "no move" (0 %) or a direction without a percentage.
      const changePct = first > 0 ? r3(((last - first) / first) * 100) : last === first ? 0 : undefined;
      const direction: Trend["direction"] = changePct === undefined ? (last > first ? "rising" : "falling") : changePct > 1 ? "rising" : changePct < -1 ? "falling" : "flat";
      trends.push({ entity: label, direction, changePct, points: pts.length, latest, cite: id });
    }
  }

  return {
    runId,
    createdAt: new Date().toISOString(),
    brand: brandOf(input.brand),
    competitor: brandOf(competitor),
    locale: { countryCodes: [project.country_code], language: countryLanguage(project.country_code) },
    where,
    who,
    interests,
    creators,
    gap,
    trends,
    copyAngles: [],
    citations,
  };
}

// ---------------------------------------------------------------------------------------------
// Copy angles: GLM writes them as JSON; each must be grounded in a label of this package.

const anglesSchema = z.object({
  angles: z.array(z.object({ text: z.string().min(8).max(200), grounds: z.array(z.string().max(80)).min(1).max(5) })).max(10),
});

export function groundingLabels(pkg: AttackPackage): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of [...pkg.gap.map((g) => g.label), ...pkg.interests.map((i) => i.name)]) {
    const k = l.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(l);
    }
  }
  return out.slice(0, 16);
}

export function fallbackAngles(pkg: AttackPackage): string[] {
  const labels = groundingLabels(pkg).slice(0, 4);
  if (labels.length === 0) return [`${pkg.brand.name}: made for people who want something different.`];
  return labels.map((l, i) =>
    [`Into ${l}? ${pkg.brand.name} was made for you.`, `${l}, done the ${pkg.brand.name} way.`, `For people who live for ${l}: meet ${pkg.brand.name}.`, `Love ${l}? Switch to ${pkg.brand.name}.`][i % 4],
  );
}

/** Validate GLM angles against the package labels. Exported for tests. */
export function validateAngles(raw: unknown, pkg: AttackPackage): { angles: string[]; dropped: number } {
  const parsed = anglesSchema.safeParse(raw);
  if (!parsed.success) return { angles: [], dropped: 0 };
  const labels = new Map(groundingLabels(pkg).map((l) => [l.toLowerCase(), l]));
  const out: string[] = [];
  let dropped = 0;
  for (const a of parsed.data.angles) {
    const text = clip(sanitizeText(a.text).replace(/\s+/g, " ").trim(), 140);
    // Grounded = names at least one label of this package (in its grounds list or word for word in the text).
    const grounded = a.grounds.filter((g) => labels.has(g.trim().toLowerCase()));
    const mentions = [...labels.keys()].some((l) => text.toLowerCase().includes(l));
    const leaks = /\[(?:redacted|env|path|ip|host|url)\]/.test(text);
    const namesCompetitor = pkg.competitor.name.length > 2 && text.toLowerCase().includes(pkg.competitor.name.toLowerCase()) && !/people like/i.test(text);
    if ((grounded.length === 0 && !mentions) || leaks || namesCompetitor) {
      dropped++;
      continue;
    }
    if (!out.includes(text)) out.push(text);
  }
  return { angles: out.slice(0, 5), dropped };
}

export async function writeCopyAngles(pkg: AttackPackage, ask: (req: ChatRequest) => Promise<ChatResult>): Promise<{ angles: string[]; source: string; dropped: number }> {
  const labels = groundingLabels(pkg);
  if (labels.length === 0) return { angles: fallbackAngles(pkg), source: "fallback (no labels from Qloo)", dropped: 0 };
  const res = await ask({ purpose: "copy", messages: copyMessages({ brand: pkg.brand.name, competitor: pkg.competitor.name, labels, language: pkg.locale.language }), json: true, maxTokens: 2048 });
  if (!res.empty) {
    let raw: unknown = null;
    try {
      raw = JSON.parse(res.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
    } catch {
      const m = res.content.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          raw = JSON.parse(m[0]);
        } catch {
          raw = null;
        }
      }
    }
    const v = validateAngles(raw, pkg);
    if (v.angles.length > 0) return { angles: v.angles, source: `llm (${res.model})`, dropped: v.dropped };
    return { angles: fallbackAngles(pkg), source: "fallback (LLM angles failed validation)", dropped: v.dropped };
  }
  return { angles: fallbackAngles(pkg), source: "fallback (LLM unavailable)", dropped: 0 };
}

// ---------------------------------------------------------------------------------------------
// vsLastRun: compare with the previous completed run of this project.

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${r2(n)}%`;
const fmtPts = (n: number) => `${n > 0 ? "+" : ""}${r2(n)} pts`;

function trendOf(pkg: AttackPackage, entity: string) {
  return pkg.trends.find((x) => x.entity === entity);
}

/** Names in `cur` but not in `prev` (added) and the reverse (dropped), case-insensitive, in list order. */
export function listChange(prev: string[], cur: string[]): ListChange {
  const p = new Set(prev.map((x) => x.toLowerCase()));
  const c = new Set(cur.map((x) => x.toLowerCase()));
  return { added: cur.filter((x) => !p.has(x.toLowerCase())), dropped: prev.filter((x) => !c.has(x.toLowerCase())) };
}

const topMetros = (pkg: AttackPackage) => pkg.where.filter((w) => w.city).slice(0, 5).map((w) => w.city!);
const fmtList = (xs: string[], max = 3) => (xs.length > max ? `${xs.slice(0, max).join(", ")} +${xs.length - max} more` : xs.join(", "));

/**
 * Pure comparison of two packages for the same competitor (the previous run's and this run's). Every number comes
 * from the two stored packages; `cite` lists the calls behind the compared fields in both runs.
 */
export function diffPackages(prev: AttackPackage, pkg: AttackPackage, previousRunId: string, previousRunAt?: string): NonNullable<AttackPackage["vsLastRun"]> {
  // Trends: brand and competitor series, each with this run's changePct (always a number) and the move since last run.
  const trends: TrendChange[] = [];
  for (const [role, entity, prevEntity] of [["brand", pkg.brand.name, prev.brand.name], ["competitor", pkg.competitor.name, prev.competitor.name]] as const) {
    const t = trendOf(pkg, entity);
    if (!t) continue;
    const p = trendOf(prev, prevEntity);
    const changePct = t.changePct ?? 0;
    const prevChangePct = p ? (p.changePct ?? 0) : undefined;
    trends.push({
      entity,
      role,
      direction: t.direction,
      changePct,
      prevDirection: p?.direction,
      prevChangePct,
      deltaPts: prevChangePct === undefined ? 0 : r3(changePct - prevChangePct),
      cite: t.cite,
      prevCite: p?.cite,
    });
  }

  // Momentum gap: brand trend change minus competitor trend change (percentage points). Higher = brand gaining.
  const level = (x: AttackPackage, e: string) => trendOf(x, e)?.changePct ?? 0;
  const now = r3(level(pkg, pkg.brand.name) - level(pkg, pkg.competitor.name));
  const before = r3(level(prev, prev.brand.name) - level(prev, prev.competitor.name));

  // Taste gap: totals plus labels that entered, left or moved.
  const total = r3(pkg.gap.reduce((s, g) => s + g.delta, 0));
  const prevTotal = r3(prev.gap.reduce((s, g) => s + g.delta, 0));
  const gapLabels = listChange(prev.gap.map((g) => g.label), pkg.gap.map((g) => g.label));
  const prevDelta = new Map(prev.gap.map((g) => [g.label.toLowerCase(), g.delta]));
  const moved = pkg.gap
    .filter((g) => prevDelta.has(g.label.toLowerCase()))
    .map((g) => ({ label: g.label, delta: g.delta, prevDelta: prevDelta.get(g.label.toLowerCase())!, change: r3(g.delta - prevDelta.get(g.label.toLowerCase())!) }))
    .filter((m) => Math.abs(m.change) >= 0.001)
    .sort((x, y) => Math.abs(y.change) - Math.abs(x.change));

  const creators = listChange(prev.creators.map((c) => c.name), pkg.creators.map((c) => c.name));
  const where = listChange(topMetros(prev), topMetros(pkg));
  const unchanged =
    trends.every((t) => t.deltaPts === 0 && (t.prevDirection === undefined || t.prevDirection === t.direction)) &&
    Math.abs(total - prevTotal) < 0.001 && gapLabels.added.length + gapLabels.dropped.length + moved.length === 0 &&
    creators.added.length + creators.dropped.length === 0 && where.added.length + where.dropped.length === 0;

  const changes: RunChanges = {
    momentum: { now, before, change: r3(now - before) },
    trends,
    gap: { total, prevTotal, change: r3(total - prevTotal), ...gapLabels, moved, cite: pkg.gap[0]?.cite, prevCite: prev.gap[0]?.cite },
    creators,
    where,
    unchanged,
  };

  const momentumUp = now > before + 0.05;
  const gapNarrower = total < prevTotal - 0.05;
  const gainingOn = momentumUp || (Math.abs(now - before) <= 0.05 && gapNarrower);

  const since = previousRunAt ? `since the run at ${previousRunAt.slice(0, 16).replace("T", " ")} UTC` : "since the last run";
  const moves: string[] = [];
  for (const t of trends) {
    if (t.prevChangePct !== undefined && (t.deltaPts !== 0 || t.prevDirection !== t.direction)) moves.push(`${t.entity} trend ${t.prevDirection} ${fmtPct(t.prevChangePct)} → ${t.direction} ${fmtPct(t.changePct)}`);
  }
  if (gapLabels.added.length) moves.push(`new gap tags: ${fmtList(gapLabels.added)}`);
  if (gapLabels.dropped.length) moves.push(`gap tags gone: ${fmtList(gapLabels.dropped)}`);
  if (moved.length) moves.push(`gap tags moved: ${fmtList(moved.map((m) => `${m.label} ${m.change > 0 ? "+" : ""}${m.change}`))}`);
  if (creators.added.length) moves.push(`new recommendations: ${fmtList(creators.added)}`);
  if (creators.dropped.length) moves.push(`recommendations gone: ${fmtList(creators.dropped)}`);
  if (where.added.length) moves.push(`metros into the top 5: ${fmtList(where.added)}`);
  if (where.dropped.length) moves.push(`metros out of the top 5: ${fmtList(where.dropped)}`);
  const trendLine = trends.map((t) => `${t.entity} ${t.direction} ${fmtPct(t.changePct)}`).join(", ");
  const summary =
    `Momentum vs ${pkg.competitor.name}: ${fmtPts(before)} last run, ${fmtPts(now)} now (brand trend change minus competitor trend change${trendLine ? `; ${trendLine}` : ""}). ` +
    `Taste gap: ${prevTotal.toFixed(2)} → ${total.toFixed(2)}. ` +
    `${unchanged ? `No change ${since}.` : `Changed ${since}: ${moves.join("; ")}.`} ` +
    `${gainingOn ? `${pkg.brand.name} is gaining.` : `${pkg.brand.name} is not gaining yet.`}`;

  const cites = [
    ...pkg.trends.map((t) => t.cite),
    ...prev.trends.map((t) => t.cite),
    pkg.gap[0]?.cite,
    prev.gap[0]?.cite,
    ...(creators.added.length + creators.dropped.length ? [...new Set(pkg.creators.map((c) => c.cite))] : []),
    ...(where.added.length + where.dropped.length ? [pkg.where[0]?.cite, prev.where[0]?.cite] : []),
  ];
  return { previousRunId, previousRunAt, gainingOn, summary, cite: [...new Set(cites.filter((c): c is string => Boolean(c)))], changes };
}

export function compareWithLastRun(pkg: AttackPackage, projectId: number, runId: string): AttackPackage["vsLastRun"] | undefined {
  const prevRun = runs.latestDone(projectId, runId);
  if (!prevRun) return undefined;
  const prevRow = packages.forRun(prevRun.id).find((p) => p.competitor === pkg.competitor.name);
  if (!prevRow) return undefined;
  let prev: AttackPackage;
  try {
    prev = JSON.parse(prevRow.package_json) as AttackPackage;
  } catch {
    return undefined;
  }
  return diffPackages(prev, pkg, prevRun.id, prevRun.finished_at ?? prevRun.started_at);
}
