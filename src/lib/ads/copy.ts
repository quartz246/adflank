import type { AttackPackage, GapHook, Interest } from "@/lib/types/attack";
import { textLength } from "./limits";
import { dedupe, mentions } from "./validate";

/** The product's audience wording: Qloo is aggregate taste, never a customer list. */
export function peopleLike(competitor: string): string {
  return `people like ${competitor}'s customers`;
}

/**
 * Normalise generated ad text: drop control characters and angle brackets, collapse whitespace and
 * strip leading spreadsheet-formula characters (= + @) so text is safe in CSV and in every mockup.
 */
export function cleanText(s: string): string {
  return s
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[=+@]+\s*/, "");
}

/** Remove links, @mentions and hashtags (TikTok non-Spark captions do not allow them). */
export function stripTikTokSymbols(s: string): string {
  return cleanText(
    s
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\bwww\.\S+/gi, "")
      .replace(/[@#]/g, ""),
  );
}

/**
 * Whole text if it fits, else the longest leading sentence or clause that fits (never a cut
 * mid-phrase). Returns null when no clause of at least `minLen` fits.
 */
export function fitClause(s: string, max: number, cjkDouble = true, minLen = 10): string | null {
  const t = cleanText(s);
  if (!t) return null;
  if (textLength(t, cjkDouble) <= max) return t;
  let best: string | null = null;
  const re = /[.!?。！？,:;、—–]/gu;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const end = m.index + m[0].length;
    const cand = t.slice(0, /[.!?。！？]/u.test(m[0]) ? end : m.index).trim();
    if (textLength(cand, cjkDouble) > max) break;
    if (textLength(cand, cjkDouble) >= minLen) best = cand;
  }
  return best;
}

/** First candidate that fits whole (no truncation). */
export function firstFit(cands: (string | undefined | null)[], max: number, cjkDouble = true): string | null {
  for (const c of cands) {
    if (!c) continue;
    const t = cleanText(c);
    if (t && textLength(t, cjkDouble) <= max) return t;
  }
  return null;
}

/** Hard cut to `max` (platform-counted) characters; used only for names that must exist. */
export function hardCut(s: string, max: number, cjkDouble = true): string {
  let out = "";
  for (const ch of cleanText(s)) {
    if (textLength(out + ch, cjkDouble) > max) break;
    out += ch;
  }
  return out.trim();
}

export function slug(s: string, max = 15): string {
  const base = cleanText(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return hardCut(base, max).replace(/-+$/g, "");
}

/** Remove the competitor's name from copy (trademarks stay in keywords only). */
export function withoutName(s: string, name: string): string | null {
  return mentions(s, name) ? null : s;
}

/**
 * Qloo place-domain tags (urn:tag:<category>:place:...) describe venues: dishes, card networks, price
 * bands, hotel ratings, amenities. They are not audience interests on any ad platform, so they are
 * never targeted or written into copy. The text check covers the same tags when no tag id is given.
 */
const VENUE_TEXT = /\b(in)?expensive\b|\bcheap\b|\bmoderately\b|\bprice[ds]?\b|\b(four|five|three|two|one)[ -]star\b|\bvisa\b|\bmastercard\b|\bamerican express\b|\bamex\b|\bcredit cards?\b|\bhotels?\b|\bmotels?\b|\bwomen-owned\b|\bwheelchair\b|\bparking\b|\btakeout\b|\bdelivery\b|\breservations?\b/i;

export function isTargetableTag(name: string, tagId?: string): boolean {
  if (tagId && /^urn:tag:[^:]+:place:/i.test(tagId)) return false;
  return !!cleanText(name) && !VENUE_TEXT.test(name);
}

/** Single-word labels that read as adjectives ("active", "stylish", "dynamic"). */
const NOUNS_LIKE_ADJ = new Set(["music", "magic", "logic", "comic", "comics", "picnic", "clinic", "mosaic", "topic", "fabric", "traffic", "relish", "fish", "dish", "polish"]);

export function isAdjective(label: string): boolean {
  const t = label.trim().toLocaleLowerCase();
  return !/\s/.test(t) && !NOUNS_LIKE_ADJ.has(t) && /(ive|ish|ic|ful|ous|able|ible)$/.test(t);
}

/** Title Case for labels going into headlines: capitalises lowercase words, keeps "VISA", "iPhone". */
export function titleCase(s: string): string {
  return s.replace(/(^|[\s-])(\p{Ll})(\p{Ll}*)(?=$|[\s-])/gu, (_, p: string, c: string, rest: string) => p + c.toLocaleUpperCase() + rest);
}

export interface CopyBank {
  brand: string;
  competitor: string;
  gaps: GapHook[];            // strongest switching hooks first
  interests: Interest[];      // highest affinity first, targetable only
  angles: string[];           // LLM-written angles, cleaned, without the competitor's name
  topCity?: string;
}

/** The raw material every platform's copy is built from. */
export function copyBank(pkg: AttackPackage): CopyBank {
  const competitor = pkg.competitor.name;
  const seen = new Set<string>();
  const once = (s: string) => {
    const k = cleanText(s).toLocaleLowerCase().replace(/s$/, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };
  const gaps = [...pkg.gap].filter((g) => isTargetableTag(g.label) && !mentions(g.label, competitor))
    .sort((a, b) => b.delta - a.delta).filter((g) => once(g.label));
  seen.clear();
  const interests = [...pkg.interests].filter((i) => isTargetableTag(i.name, i.qlooTagId) && !mentions(i.name, competitor))
    .sort((a, b) => b.affinity - a.affinity).filter((i) => once(i.name));
  const angles = dedupe(pkg.copyAngles.map(cleanText)).filter((a) => a && !mentions(a, competitor));
  const topCity = [...pkg.where].sort((a, b) => b.score - a.score).find((w) => w.city)?.city;
  return { brand: cleanText(pkg.brand.name), competitor, gaps, interests, angles, topCity };
}
