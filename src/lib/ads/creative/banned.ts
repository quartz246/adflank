/**
 * Deterministic copy filter for the ad creatives. Every line a model or a template writes passes through here before it
 * reaches an image, a mockup or an export. A line is rejected (not patched) so the caller falls back to the next candidate.
 *
 * Rules:
 * - no stock ad filler ("Unlock", "Elevate", "Discover", "game-changer" ...): it is what makes ads read as machine-written;
 * - no invented stats: digits, percentages, "#1", "best-selling", "award-winning" are claims we cannot cite;
 * - no competitor names (conquest ads target "people like X's customers" and never name X);
 * - no hashtags, emoji clusters, shouting or exclamation spam.
 */

/** Phrases (lower case, matched on word boundaries) that a sharp human copywriter would cut. */
export const BANNED_PHRASES: readonly string[] = [
  "unlock", "unleash", "elevate", "elevated", "discover", "embark", "embrace", "dive into", "delve", "immerse",
  "revolutionize", "revolutionise", "revolutionary", "game-changer", "game changer", "game-changing", "next level",
  "next-level", "take it to the next level", "transform your", "transformative", "empower", "journey", "curated",
  "seamless", "seamlessly", "effortless", "effortlessly", "redefine", "reimagine", "reimagined", "like never before",
  "look no further", "whether you're", "whether you are", "in today's", "fast-paced", "harness", "supercharge",
  "skyrocket", "boost your", "ultimate", "cutting-edge", "cutting edge", "innovative", "world-class", "best-in-class",
  "must-have", "must have", "one-stop", "elevate your", "level up", "treat yourself", "indulge", "experience the",
  "the perfect blend", "perfect for", "designed for you", "made for you", "tailored", "crafted for", "pov:", "pov ",
  "is your thing", "your brand", "this one's for you", "this one is for you", "join the movement", "join thousands",
  "don't miss", "dont miss", "limited time", "act now", "hurry", "you won't believe", "vibes", "good vibes",
  "synergy", "leverage", "holistic", "robust", "state-of-the-art", "premium quality", "high-quality", "top-notch",
  "best", "world's", "most comfortable", "best-selling", "bestselling", "award-winning", "#1", "number one", "guaranteed", "100%", "made for",
];

const WORDY = /[a-z0-9]/i;

function hit(text: string, phrase: string): boolean {
  const t = ` ${text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ")} `;
  const p = phrase.toLowerCase();
  if (!WORDY.test(p[0]) || !WORDY.test(p[p.length - 1])) return t.includes(p);
  let i = t.indexOf(p);
  while (i >= 0) {
    const before = t[i - 1] ?? " ";
    const after = t[i + p.length] ?? " ";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    i = t.indexOf(p, i + 1);
  }
  return false;
}

export interface FilterContext {
  /** Names that must never appear in ad text (the competitors). */
  forbidNames?: string[];
  /**
   * Grounded names (the brand, Qloo taste labels, places, shows). They are removed before the filler and number checks,
   * so a Qloo tag like "Journey" or a brand like "7-Eleven" does not fail a line that quotes it.
   */
  grounded?: string[];
}

export interface FilterVerdict { ok: boolean; reason?: string }

/** Why a line fails the copy rules (first reason), or ok. */
export function checkLine(text: string, ctx: FilterContext = {}): FilterVerdict {
  const t = (text ?? "").trim();
  if (!t) return { ok: false, reason: "empty" };
  let rest = t;
  for (const g of [...(ctx.grounded ?? [])].sort((a, b) => b.length - a.length)) if (g.trim()) rest = rest.replace(new RegExp(g.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  for (const p of BANNED_PHRASES) if (hit(rest, p)) return { ok: false, reason: `filler: "${p}"` };
  if (/\d/.test(rest)) return { ok: false, reason: "contains a number we cannot cite" };
  if (/%/.test(t)) return { ok: false, reason: "contains a percentage" };
  for (const n of ctx.forbidNames ?? []) if (n.trim().length > 1 && hit(t, n.trim())) return { ok: false, reason: `names a competitor (${n})` };
  if (/#\w/.test(t)) return { ok: false, reason: "hashtag" };
  if (/!{2,}|\?{2,}/.test(t) || (t.match(/!/g) ?? []).length > 1) return { ok: false, reason: "exclamation spam" };
  if (/\p{Extended_Pictographic}/u.test(t)) return { ok: false, reason: "emoji" };
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) return { ok: false, reason: "all caps" };
  if (/\[(?:redacted|env|path|ip|host|url)\]/i.test(t)) return { ok: false, reason: "sanitiser placeholder" };
  return { ok: true };
}

export const isClean = (text: string, ctx: FilterContext = {}) => checkLine(text, ctx).ok;

/** First candidate that passes the rules and fits `max` characters, else null. */
export function pickClean(cands: Array<string | undefined | null>, max: number, ctx: FilterContext = {}): string | null {
  for (const c of cands) {
    const t = (c ?? "").replace(/\s+/g, " ").trim();
    if (t && [...t].length <= max && isClean(t, ctx)) return t;
  }
  return null;
}
