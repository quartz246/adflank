import { z } from "zod";
import type { AgeShare, AttackPackage, PlatformTemplate, TemplateIssue } from "@/lib/types/attack";
import { mentions } from "./validate";

/** What every builder needs besides its own input: who we are and who we are winning customers from. */
export interface BuildContext {
  runId: string;
  brand: string;
  competitor: string;
  /** Citation ids the plan used; checked against `knownCites` when given. */
  cites: string[];
  knownCites?: readonly string[];
}

export function contextFrom(pkg: AttackPackage, cites: Iterable<string>): BuildContext {
  return {
    runId: pkg.runId,
    brand: pkg.brand.name,
    competitor: pkg.competitor.name,
    cites: [...new Set(cites)].filter(Boolean),
    knownCites: Object.keys(pkg.citations),
  };
}

/** Landing page placeholder; the package carries no brand URL, so templates warn until one is set. */
export const PLACEHOLDER_URL = "https://www.example.com/";

// Shared zod pieces. Caps here only stop abuse (tool calls from the LLM); platform limits are
// checked in the builders and reported as TemplateIssues so the UI can show them.
export const zName = z.string().trim().min(1).max(255);
export const zText = (max: number) => z.string().max(max);
export const zCountry = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 country code");
export const zUrl = z.url({ protocol: /^https?$/ }).max(2048);
export const zPlace = z.strictObject({ name: z.string().trim().min(1).max(120), countryCode: zCountry });

/** Finish a template: cite checks, and the CSV only when there are no error issues. */
export function finish(
  platform: PlatformTemplate["platform"],
  ctx: BuildContext,
  json: unknown,
  issues: TemplateIssue[],
  csv: (() => { filename: string; content: string }) | undefined,
): PlatformTemplate {
  if (ctx.knownCites) {
    const known = new Set(ctx.knownCites);
    const missing = ctx.cites.filter((c) => !known.has(c));
    if (missing.length) issues.push({ field: "cites", message: `Citation id(s) not in the package: ${missing.join(", ")}`, severity: "warn" });
  }
  const blocked = issues.some((i) => i.severity === "error");
  return {
    platform,
    packageRunId: ctx.runId,
    json,
    ...(csv && !blocked ? { csv: csv() } : {}),
    issues,
    cites: ctx.cites,
  };
}

const BAND_RANGE: Record<AgeShare["band"], [number, number]> = {
  "18-24": [18, 24], "25-34": [25, 34], "35-44": [35, 44], "45-54": [45, 54], "55+": [55, 65],
};
const BAND_ORDER: AgeShare["band"][] = ["18-24", "25-34", "35-44", "45-54", "55+"];

/**
 * Contiguous age span to target. Core sends Qloo's relative affinity index per band (about -1..1,
 * > 0 = over-indexed; see CONTRACT_LOG 10-29): target the span of over-indexed bands. If the values
 * look like population shares instead (all >= 0, summing to ~1), take the top bands up to 70%.
 */
export function ageSpan(ages: AgeShare[]): { min: number; max: number; bands: AgeShare["band"][] } {
  const valid = ages.filter((a) => BAND_RANGE[a.band] && Number.isFinite(a.share));
  const all = { min: 18, max: 65, bands: [...BAND_ORDER] };
  if (!valid.length) return all;
  const total = valid.reduce((s, a) => s + a.share, 0);
  const shares = valid.every((a) => a.share >= 0) && total > 0.9 && total < 1.1;
  let picked: AgeShare["band"][];
  if (shares) {
    picked = [];
    let acc = 0;
    for (const a of [...valid].sort((x, y) => y.share - x.share)) {
      picked.push(a.band);
      acc += a.share;
      if (acc / total >= 0.7) break;
    }
  } else {
    picked = valid.filter((a) => a.share > 0).map((a) => a.band);
  }
  if (!picked.length) return all;
  const idx = picked.map((b) => BAND_ORDER.indexOf(b));
  const bands = BAND_ORDER.slice(Math.min(...idx), Math.max(...idx) + 1);
  return { min: BAND_RANGE[bands[0]][0], max: BAND_RANGE[bands[bands.length - 1]][1], bands };
}

/** Target one gender only when the two values differ by more than 0.3 (works for indexes and shares). */
export function genderSkew(female?: number, male?: number): "female" | "male" | "all" {
  if (female === undefined || male === undefined) return "all";
  const d = female - male;
  return d > 0.3 ? "female" : d < -0.3 ? "male" : "all";
}

/** "near <lat>,<lon>" regions (no metro nearby) cannot be targeted by name. */
export function isTargetableRegion(region?: string): boolean {
  return !!region?.trim() && !/^near\s/i.test(region.trim());
}

export interface PlannedPlace { name: string; countryCode: string; cite: string }

export interface PlannedPlaces {
  /** Cities, labelled "City, Region" when core gave a region (helps the platform's name lookup). */
  cities: PlannedPlace[];
  regions: PlannedPlace[];
  /** Countries not already covered by a city or region (avoids overlapping locations). */
  countries: string[];
  /** Qloo locations left out because they cannot be targeted by name. */
  skipped: number;
}

export function plannedPlaces(pkg: AttackPackage, max = 10): PlannedPlaces {
  const top = [...pkg.where].sort((a, b) => b.score - a.score).slice(0, max);
  const cities: PlannedPlace[] = [], regions: PlannedPlace[] = [], countryish: string[] = [];
  let skipped = 0;
  for (const w of top) {
    const city = w.city?.trim(), region = w.region?.trim();
    if (city) cities.push({ name: isTargetableRegion(region) ? `${city}, ${region}` : city, countryCode: w.countryCode, cite: w.cite });
    else if (isTargetableRegion(region)) regions.push({ name: region!, countryCode: w.countryCode, cite: w.cite });
    else if (region) skipped++;
    else countryish.push(w.countryCode);
  }
  const covered = new Set([...cities, ...regions].map((w) => w.countryCode));
  const countries = [...new Set([...countryish, ...pkg.locale.countryCodes])]
    .map((c) => c.toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c) && !covered.has(c));
  return { cities, regions, countries, skipped };
}

/** Warning for Qloo locations that had no nearby city or region. */
export function skippedPlacesIssues(field: string, skipped: number): TemplateIssue[] {
  return skipped > 0
    ? [{ field, message: `${skipped} Qloo location(s) had no nearby city or region and were left out of targeting.`, severity: "warn" }]
    : [];
}

/** Warn (or error) when ad text names the competitor: trademarks belong in keywords only. */
export function checkTrademark(
  issues: { add(field: string, message: string, severity: "error" | "warn"): void },
  field: string,
  text: string,
  competitor: string,
  severity: "error" | "warn",
  source: string,
): void {
  if (mentions(text, competitor)) {
    issues.add(field, `Names the competitor "${competitor}". Use competitor names in keywords only. Source: ${source}`, severity);
  }
}
