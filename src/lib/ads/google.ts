import { z } from "zod";
import type { AttackPackage, PlatformTemplate } from "@/lib/types/attack";
import { GOOGLE } from "./limits";
import { Issues, dedupe, mentions } from "./validate";
import { cleanText, copyBank, fitClause, isAdjective, peopleLike, slug, titleCase } from "./copy";
import { PLACEHOLDER_URL, skippedPlacesIssues, checkTrademark, contextFrom, finish, plannedPlaces, zCountry, zName, zText, zUrl, type BuildContext } from "./context";
import { csvFilename, toCsv } from "./csv";

export const GOOGLE_MATCH_TYPES = ["Broad", "Phrase", "Exact"] as const;

/** Input of the Google Ads (Search campaign + Responsive Search Ad) builder. */
export const GoogleInputSchema = z.strictObject({
  campaignName: zName,
  adGroupName: zName,
  dailyBudget: z.number().positive().max(100_000),          // account currency per day
  headlines: z.array(zText(300)).max(30),
  descriptions: z.array(zText(500)).max(10),
  path1: zText(100),
  path2: zText(100),
  finalUrl: zUrl,
  keywords: z.array(z.strictObject({
    text: zText(300),
    match: z.enum(GOOGLE_MATCH_TYPES),
    negative: z.boolean(),
  })).max(200),
  locations: z.array(z.strictObject({ name: z.string().trim().min(1).max(200), countryCode: zCountry })).max(500),
  /** Custom segment seeds: interests and searches of people like the competitor's customers. */
  segmentSeeds: z.array(zText(200)).max(50),
});
export type GoogleInput = z.infer<typeof GoogleInputSchema>;

const EDITOR_HEADER = [
  "Campaign", "Campaign Type", "Campaign Status", "Budget", "Ad Group", "Keyword", "Criterion Type", "Ad type",
  ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
  "Path 1", "Path 2", "Final URL", "Location",
] as const;

/** Keyword text as Google accepts it: lowercase words, no symbols Google rejects. */
export function keywordText(s: string): string {
  return cleanText(s).toLocaleLowerCase().replace(/[^\p{L}\p{N}&'.\- ]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function planGoogle(pkg: AttackPackage, opts: { landingUrl?: string } = {}): { input: GoogleInput; cites: string[] } {
  const b = copyBank(pkg);
  const places = plannedPlaces(pkg);
  const cites: string[] = [];
  const fit = (s: string) => fitClause(s, GOOGLE.headline.max, true, 8);

  const headlineCands: (string | null)[] = [fit(b.brand)];
  if (b.topCity) headlineCands.push(fit(`${b.brand} in ${b.topCity}`));
  for (const g of b.gaps.slice(0, 4)) {
    const l = titleCase(g.label);
    if (isAdjective(g.label)) headlineCands.push(fit(`${l} by Design`), fit(`Made for ${l} Lives`));
    else headlineCands.push(fit(`Love ${l}?`), fit(`Made for ${l} Fans`));
  }
  for (const i of b.interests.slice(0, 3)) if (!isAdjective(i.name)) headlineCands.push(fit(`For ${titleCase(i.name)} Lovers`));
  for (const a of b.angles) headlineCands.push(fit(a));
  headlineCands.push(fit(`Try ${b.brand} Today`), fit(`Switch to ${b.brand}`), fit("See Why People Switch"));
  const headlines = dedupe(headlineCands.filter((h): h is string => !!h && !mentions(h, b.competitor))).slice(0, 15);

  const descCands: (string | null)[] = b.angles.map((a) => fitClause(a, GOOGLE.description.max));
  const g0 = b.gaps[0]?.label, i0 = b.interests.find((i) => !isAdjective(i.name))?.name;
  const g1 = b.gaps.slice(1).find((g) => g0 && !g.label.toLocaleLowerCase().includes(g0.toLocaleLowerCase()) && !g0.toLocaleLowerCase().includes(g.label.toLocaleLowerCase()))?.label;
  if (g0) descCands.push(fitClause(`${b.brand} is made for people into ${g0.toLocaleLowerCase()}${g1 ? ` and ${g1.toLocaleLowerCase()}` : ""}. Come see why people switch.`, GOOGLE.description.max));
  if (i0) descCands.push(fitClause(`Into ${i0}? ${b.brand} was built for you. Try it today.`, GOOGLE.description.max));
  descCands.push(fitClause(`Discover ${b.brand}. Made for people who know what they like. Try it today.`, GOOGLE.description.max));
  const descriptions = dedupe(descCands.filter((d): d is string => !!d && !mentions(d, b.competitor))).slice(0, 4);

  // Search keywords: the competitor (conquesting) and the brand. Interests and gap hooks go into the
  // custom audience segment below: as bare search keywords ("sports", "hip hop") they would buy
  // unrelated searches.
  const comp = keywordText(b.competitor), brand = keywordText(b.brand);
  const keywords: GoogleInput["keywords"] = [];
  if (comp) {
    keywords.push(
      { text: comp, match: "Exact", negative: false },
      { text: comp, match: "Phrase", negative: false },
      { text: `${comp} alternative`, match: "Phrase", negative: false },
      { text: `brands like ${comp}`, match: "Phrase", negative: false },
      { text: `${comp} near me`, match: "Phrase", negative: false },
    );
    if (brand) keywords.push({ text: `${comp} vs ${brand}`, match: "Phrase", negative: false });
  }
  if (brand) keywords.push({ text: brand, match: "Exact", negative: false });
  if (comp) keywords.push({ text: `${comp} jobs`, match: "Phrase", negative: true }, { text: `${comp} careers`, match: "Phrase", negative: true });

  const locations: GoogleInput["locations"] = [
    ...places.cities.map((w) => ({ name: w.name, countryCode: w.countryCode })),
    ...places.regions.map((w) => ({ name: w.name, countryCode: w.countryCode })),
    ...places.countries.map((c) => ({ name: c, countryCode: c })),
  ];
  for (const w of [...places.cities, ...places.regions]) cites.push(w.cite);

  // Cite every gap and interest whose label made it into the ad text or the audience segment.
  const text = [...headlines, ...descriptions].join(" \n ").toLocaleLowerCase();
  for (const g of b.gaps) if (text.includes(g.label.toLocaleLowerCase())) cites.push(g.cite);
  for (const i of b.interests) if (text.includes(i.name.toLocaleLowerCase())) cites.push(i.cite);

  const segInterests = b.interests.slice(0, 8), segGaps = b.gaps.slice(0, 4);
  const segmentSeeds = dedupe([...segInterests.map((i) => i.name), ...segGaps.map((g) => g.label), b.competitor]);
  for (const x of [...segInterests, ...segGaps]) cites.push(x.cite);

  const input: GoogleInput = {
    campaignName: `AdFlank | ${b.brand} vs ${b.competitor} | Search`.slice(0, 255),
    adGroupName: `People like ${b.competitor}'s customers`.slice(0, 255),
    dailyBudget: 20,
    headlines,
    descriptions,
    path1: slug(g0 ?? b.brand, GOOGLE.path.max),
    path2: slug(b.topCity ?? "switch", GOOGLE.path.max),
    finalUrl: opts.landingUrl ?? PLACEHOLDER_URL,
    keywords,
    locations,
    segmentSeeds,
  };
  return { input, cites };
}

export function buildGoogle(raw: GoogleInput, ctx: BuildContext): PlatformTemplate {
  const input = GoogleInputSchema.parse(raw);
  const is = new Issues();
  const headlines = input.headlines.map(cleanText);
  const descriptions = input.descriptions.map(cleanText);

  is.count("headlines", "headlines", headlines.length, GOOGLE.headlineCount.min, GOOGLE.headlineCount.max, GOOGLE.headlineCount.source);
  headlines.forEach((h, i) => {
    const f = `headlines[${i}]`;
    is.length(f, `Headline ${i + 1}`, h, GOOGLE.headline);
    checkTrademark(is, f, h, ctx.competitor, GOOGLE.trademarkInText.severity, GOOGLE.trademarkInText.source);
    if (h.includes("!")) is.warn(f, `Headline ${i + 1} has "!"; Google does not allow exclamation marks in headlines. Source: ${GOOGLE.exclamationInHeadline.source}`);
  });
  if (dedupe(headlines).length !== headlines.length) is.warn("headlines", "Some headlines repeat; Google needs each headline to be unique.");

  is.count("descriptions", "descriptions", descriptions.length, GOOGLE.descriptionCount.min, GOOGLE.descriptionCount.max, GOOGLE.descriptionCount.source);
  descriptions.forEach((d, i) => {
    const f = `descriptions[${i}]`;
    is.length(f, `Description ${i + 1}`, d, GOOGLE.description);
    checkTrademark(is, f, d, ctx.competitor, GOOGLE.trademarkInText.severity, GOOGLE.trademarkInText.source);
  });

  is.length("path1", "Path 1", input.path1, GOOGLE.path);
  is.length("path2", "Path 2", input.path2, GOOGLE.path);
  if (input.path2 && !input.path1) is.warn("path2", "Path 2 is set without Path 1; Google shows Path 2 only after Path 1.");

  const positives = input.keywords.filter((k) => !k.negative);
  if (!positives.length) is.error("keywords", "No keywords: a Search ad group needs at least one.");
  input.keywords.forEach((k, i) => {
    const f = `keywords[${i}]`;
    is.length(f, `Keyword "${k.text}"`, k.text, GOOGLE.keyword);
    is.words(f, `Keyword "${k.text}"`, k.text, GOOGLE.keywordWords.max, GOOGLE.keywordWords.source, GOOGLE.keywordWords.verified);
  });

  if (!input.locations.length) is.warn("locations", "No locations: the campaign would target every location.");
  else is.warn("locations", "Location names must be matched to Google geo targets on import (Ads Editor resolves names; check each match).");
  if (input.finalUrl === PLACEHOLDER_URL) is.warn("finalUrl", "Final URL is a placeholder; set the brand's landing page before upload.");

  const matchType = (m: (typeof GOOGLE_MATCH_TYPES)[number]) => m.toUpperCase();
  const json = {
    campaign: {
      name: input.campaignName,
      advertising_channel_type: "SEARCH",
      status: "PAUSED",
      campaign_budget: { amount_micros: Math.round(input.dailyBudget * 1_000_000), delivery_method: "STANDARD" },
      network_settings: { target_google_search: true, target_search_network: true, target_content_network: false },
      geo_target_locations: input.locations.map((l) => ({ name: l.name, country_code: l.countryCode, geo_target_constant: "LOOKUP_REQUIRED" })),
    },
    ad_group: { name: input.adGroupName, status: "PAUSED", type: "SEARCH_STANDARD" },
    ad_group_ad: {
      status: "PAUSED",
      ad: {
        final_urls: [input.finalUrl],
        responsive_search_ad: {
          headlines: headlines.map((text) => ({ text })),
          descriptions: descriptions.map((text) => ({ text })),
          path1: input.path1,
          path2: input.path2,
        },
      },
    },
    keywords: input.keywords.map((k) => ({ text: k.text, match_type: matchType(k.match), negative: k.negative })),
    audience_segments: [{
      type: "CUSTOM_SEGMENT",
      name: `AdFlank: ${peopleLike(ctx.competitor)}`.slice(0, 255),
      members: input.segmentSeeds.map((s) => ({ keyword: s })),
    }],
    adflank: { audience: peopleLike(ctx.competitor), brand: ctx.brand, competitor: ctx.competitor, cites: ctx.cites },
  };

  const csv = () => {
    const base = { Campaign: input.campaignName };
    const rows: Record<string, unknown>[] = [
      { ...base, "Campaign Type": "Search", "Campaign Status": "Paused", Budget: input.dailyBudget.toFixed(2) },
      { ...base, "Ad Group": input.adGroupName },
      ...input.keywords.map((k) => ({
        ...base, "Ad Group": input.adGroupName, Keyword: k.text, "Criterion Type": k.negative ? `Negative ${k.match}` : k.match,
      })),
      {
        ...base, "Ad Group": input.adGroupName, "Ad type": "Responsive search ad",
        ...Object.fromEntries(headlines.map((h, i) => [`Headline ${i + 1}`, h])),
        ...Object.fromEntries(descriptions.map((d, i) => [`Description ${i + 1}`, d])),
        "Path 1": input.path1, "Path 2": input.path2, "Final URL": input.finalUrl,
      },
      ...input.locations.map((l) => ({ ...base, Location: l.name === l.countryCode ? l.countryCode : `${l.name}, ${l.countryCode}` })),
    ];
    return { filename: csvFilename("google", ctx.runId), content: toCsv(EDITOR_HEADER, rows) };
  };

  return finish("google", ctx, json, is.list, csv);
}

export function googleTemplate(pkg: AttackPackage, opts: { landingUrl?: string } = {}): PlatformTemplate {
  const { input, cites } = planGoogle(pkg, opts);
  const t = buildGoogle(input, contextFrom(pkg, cites));
  t.issues.push(...skippedPlacesIssues("locations", plannedPlaces(pkg).skipped));
  return t;
}
