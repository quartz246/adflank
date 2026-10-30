import { z } from "zod";
import type { AttackPackage, PlatformTemplate } from "@/lib/types/attack";
import { META } from "./limits";
import { Issues } from "./validate";
import { cleanText, copyBank, firstFit, fitClause, hardCut, isAdjective, peopleLike, titleCase, possessive } from "./copy";
import {
  PLACEHOLDER_URL, skippedPlacesIssues, ageSpan, checkTrademark, contextFrom, finish, genderSkew, plannedPlaces,
  zCountry, zName, zPlace, zText, zUrl, type BuildContext,
} from "./context";
import { csvFilename, toCsv } from "./csv";

/** Meta's top-level detailed-targeting categories: the fallback when an interest has no exact match. */
export const META_CATEGORIES = [
  "Business and industry", "Entertainment", "Family and relationships", "Fitness and wellness", "Food and drink",
  "Hobbies and activities", "Shopping and fashion", "Sports and outdoors", "Technology",
] as const;
export type MetaCategory = (typeof META_CATEGORIES)[number];

const CATEGORY_WORDS: [MetaCategory, RegExp][] = [
  ["Food and drink", /coffee|tea|food|drink|bak|cook|restaurant|cafe|café|beer|wine|cocktail|vegan|plant-based|snack|chocolate|pizza|burger|brunch|dining|kitchen|recipe/i],
  ["Fitness and wellness", /fitness|gym|yoga|pilates|running|run\b|marathon|wellness|meditation|health|workout|cycling|spin/i],
  ["Sports and outdoors", /sport|football|soccer|basketball|baseball|hockey|tennis|golf|hik|trail|camp|outdoor|climb|surf|ski|snowboard|fishing/i],
  ["Shopping and fashion", /fashion|clothing|apparel|shoe|sneaker|beauty|cosmetic|makeup|skincare|jewel|luxury|shopping|boutique|thrift|vintage/i],
  ["Technology", /tech|gadget|software|computer|smartphone|gaming|video game|console|ai\b|crypto|electronics/i],
  ["Entertainment", /music|vinyl|concert|festival|film|movie|cinema|tv|television|podcast|comedy|theat|book|reading|anime|stream/i],
  ["Family and relationships", /family|parent|baby|kids|wedding|dating|pet|dog|cat/i],
  ["Business and industry", /business|startup|entrepreneur|marketing|finance|invest|real estate|career/i],
  ["Hobbies and activities", /travel|art|craft|diy|garden|photograph|design|collect|hobby|board game|volunteer/i],
];

export function closestMetaCategory(name: string): MetaCategory {
  for (const [cat, re] of CATEGORY_WORDS) if (re.test(name)) return cat;
  return "Hobbies and activities";
}

/** Input of the Meta (campaign / ad set / ad) builder. */
export const MetaInputSchema = z.strictObject({
  campaignName: zName,
  objective: z.enum(META.objectives),
  specialAdCategories: z.array(z.enum(["EMPLOYMENT", "HOUSING", "CREDIT", "ISSUES_ELECTIONS_POLITICS", "FINANCIAL_PRODUCTS_SERVICES"])).max(5),
  adSetName: zName,
  adName: zName,
  dailyBudgetCents: z.int().positive().max(1_000_000_000),
  countries: z.array(zCountry).max(300),
  regions: z.array(zPlace).max(400),
  cities: z.array(zPlace.extend({ radius: z.number().min(0).max(1000), distanceUnit: z.enum(["mile", "kilometer"]) })).max(500),
  ageMin: z.int().min(0).max(120),
  ageMax: z.int().min(0).max(120),
  /** [1] men, [2] women, omitted = all. */
  genders: z.array(z.union([z.literal(1), z.literal(2)])).max(2).optional(),
  interests: z.array(z.strictObject({ name: z.string().trim().min(1).max(120), fallbackCategory: z.enum(META_CATEGORIES) })).max(100),
  publisherPlatforms: z.array(z.enum(["facebook", "instagram"])).min(1).max(2),
  primaryText: zText(5000),
  headline: zText(500),
  description: zText(500),
  link: zUrl,
  cta: z.enum(META.ctas),
});
export type MetaInput = z.infer<typeof MetaInputSchema>;

const IMPORT_HEADER = [
  "Campaign Name", "Campaign Status", "Campaign Objective", "Special Ad Categories", "Ad Set Name", "Ad Set Daily Budget",
  "Countries", "Cities", "Gender", "Age Min", "Age Max", "Flexible Inclusions", "Publisher Platforms",
  "Ad Name", "Title", "Body", "Link Description", "Link", "Call to Action",
] as const;

export function planMeta(pkg: AttackPackage, opts: { landingUrl?: string } = {}): { input: MetaInput; cites: string[] } {
  const b = copyBank(pkg);
  const places = plannedPlaces(pkg);
  const span = ageSpan(pkg.who.ages);
  const skew = genderSkew(pkg.who.female, pkg.who.male);
  const cites: string[] = [pkg.who.cite];

  const g0 = b.gaps[0]?.label, i0 = b.interests[0]?.name;
  const lead = b.angles[0] ?? (g0 ? `For people who love ${g0}.` : `Meet ${b.brand}.`);
  const tail = ` Try ${b.brand} today.`;
  let primaryText = firstFit([lead + tail], META.primaryText.max, false) ?? fitClause(lead, META.primaryText.max, false) ?? hardCut(lead, META.primaryText.max, false);
  if (primaryText.length < META.primaryText.min && b.angles[1]) {
    primaryText = firstFit([`${lead} ${b.angles[1]}${tail}`, `${lead} ${b.angles[1]}`], META.primaryText.max, false) ?? primaryText;
  }
  const headline = firstFit([g0 && `${b.brand}: ${titleCase(g0)}`, g0 && (isAdjective(g0) ? `${titleCase(g0)} by Design` : `Love ${titleCase(g0)}?`), b.brand], META.headline.max, false) ?? hardCut(b.brand, META.headline.max, false);
  const description = firstFit([i0 && `For ${i0} fans`, `New from ${b.brand}`, `Shop ${b.brand}`], META.description.max, false) ?? "";

  const interests = b.interests.slice(0, 6).map((i) => ({ name: cleanText(i.name), fallbackCategory: closestMetaCategory(i.name) }));
  for (const i of b.interests.slice(0, 6)) cites.push(i.cite);
  const text = `${primaryText} ${headline} ${description}`.toLocaleLowerCase();
  for (const g of b.gaps) if (text.includes(g.label.toLocaleLowerCase())) cites.push(g.cite);

  const cities = places.cities.map((w) => {
    const mile = w.countryCode === "US" || w.countryCode === "GB";
    return { name: w.name, countryCode: w.countryCode, radius: mile ? 15 : 25, distanceUnit: mile ? ("mile" as const) : ("kilometer" as const) };
  });
  for (const w of [...places.cities, ...places.regions]) cites.push(w.cite);

  const input: MetaInput = {
    campaignName: `AdFlank | ${b.brand} vs ${b.competitor}`.slice(0, 255),
    objective: "OUTCOME_TRAFFIC",
    specialAdCategories: [],
    adSetName: `People like ${possessive(b.competitor)} customers`.slice(0, 255),
    adName: `${b.brand} | ${g0 ?? "switch"}`.slice(0, 255),
    dailyBudgetCents: 2000,
    countries: places.countries,
    regions: places.regions.map((w) => ({ name: w.name, countryCode: w.countryCode })),
    cities,
    ageMin: Math.max(span.min, META.ageMin.default),
    ageMax: Math.min(span.max, META.ageMax.max),
    ...(skew === "female" ? { genders: [2 as const] } : skew === "male" ? { genders: [1 as const] } : {}),
    interests,
    publisherPlatforms: ["facebook", "instagram"],
    primaryText,
    headline,
    description,
    link: opts.landingUrl ?? PLACEHOLDER_URL,
    cta: "LEARN_MORE",
  };
  return { input, cites };
}

export function buildMeta(raw: MetaInput, ctx: BuildContext): PlatformTemplate {
  const input = MetaInputSchema.parse(raw);
  const is = new Issues();
  const primaryText = cleanText(input.primaryText), headline = cleanText(input.headline), description = cleanText(input.description);

  if (input.ageMin < META.ageMin.min) is.error("adset.targeting.age_min", `age_min is ${input.ageMin}; Meta needs at least ${META.ageMin.min}. Source: ${META.ageMin.source}`);
  if (input.ageMax > META.ageMax.max) is.error("adset.targeting.age_max", `age_max is ${input.ageMax}; Meta allows at most ${META.ageMax.max} (65 means 65+). Source: ${META.ageMax.source}`);
  if (input.ageMin > input.ageMax) is.error("adset.targeting.age_min", `age_min ${input.ageMin} is above age_max ${input.ageMax}.`);

  if (!input.countries.length && !input.regions.length && !input.cities.length) {
    is.error("adset.targeting.geo_locations", `No location: Meta needs at least one country unless a Custom Audience is used. Source: ${META.countriesMin.source}`);
  }
  if (input.regions.length > META.regionsMax.max) is.error("adset.targeting.geo_locations.regions", `${input.regions.length} regions; Meta allows up to ${META.regionsMax.max}. Source: ${META.regionsMax.source}`);
  if (input.cities.length > META.citiesMax.max) is.error("adset.targeting.geo_locations.cities", `${input.cities.length} cities; Meta allows up to ${META.citiesMax.max}. Source: ${META.citiesMax.source}`);
  input.cities.forEach((c, i) => {
    const r = c.distanceUnit === "mile" ? META.cityRadiusMile : META.cityRadiusKm;
    if (c.radius < r.min || c.radius > r.max) {
      is.error(`adset.targeting.geo_locations.cities[${i}].radius`, `${c.name}: radius ${c.radius} ${c.distanceUnit}; Meta allows ${r.min}-${r.max} ${c.distanceUnit === "mile" ? "miles" : "km"}. Source: ${r.source}`);
    }
  });
  if (input.cities.length + input.regions.length) {
    is.warn("adset.targeting.geo_locations", `${input.cities.length + input.regions.length} location key(s) need Meta's Targeting Search (type=adgeolocation) before upload; keys are LOOKUP_REQUIRED.`);
  }
  if (input.cities.length > 1) is.warn("adset.targeting.geo_locations.cities", "Several cities with a radius can overlap; Meta may return error 100/1815946. Check overlaps on import.");
  if (input.interests.length) {
    const list = input.interests.map((i) => `${i.name} (else ${i.fallbackCategory})`).join("; ");
    is.warn("adset.targeting.flexible_spec", `Interest ids need Meta's Targeting Search (type=adinterest); ids are LOOKUP_REQUIRED. If a name has no match use the category: ${list}.`);
  }

  is.length("ad.creative.link_data.message", "Primary text", primaryText, META.primaryText);
  is.length("ad.creative.link_data.name", "Headline", headline, META.headline);
  is.length("ad.creative.link_data.description", "Description", description, META.description);
  for (const [f, t] of [["ad.creative.link_data.message", primaryText], ["ad.creative.link_data.name", headline], ["ad.creative.link_data.description", description]] as const) {
    checkTrademark(is, f, t, ctx.competitor, META.trademarkInText.severity, META.trademarkInText.source);
  }
  if (input.link === PLACEHOLDER_URL) is.warn("ad.creative.link_data.link", "Link is a placeholder; set the brand's landing page before upload.");

  const json = {
    campaign: {
      name: input.campaignName,
      objective: input.objective,
      status: "PAUSED",
      buying_type: "AUCTION",
      special_ad_categories: input.specialAdCategories,
    },
    adset: {
      name: input.adSetName,
      status: "PAUSED",
      daily_budget: input.dailyBudgetCents,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      targeting: {
        geo_locations: {
          ...(input.countries.length ? { countries: input.countries } : {}),
          ...(input.regions.length ? { regions: input.regions.map((r) => ({ key: "LOOKUP_REQUIRED", name: r.name, country: r.countryCode })) } : {}),
          ...(input.cities.length ? {
            cities: input.cities.map((c) => ({ key: "LOOKUP_REQUIRED", name: c.name, country: c.countryCode, radius: c.radius, distance_unit: c.distanceUnit })),
          } : {}),
          location_types: ["home", "recent"],
        },
        age_min: input.ageMin,
        age_max: input.ageMax,
        ...(input.genders?.length ? { genders: input.genders } : {}),
        ...(input.interests.length ? { flexible_spec: [{ interests: input.interests.map((i) => ({ id: "LOOKUP_REQUIRED", name: i.name })) }] } : {}),
        publisher_platforms: input.publisherPlatforms,
        ...(input.publisherPlatforms.includes("facebook") ? { facebook_positions: ["feed"] } : {}),
        ...(input.publisherPlatforms.includes("instagram") ? { instagram_positions: ["stream"] } : {}),
      },
    },
    ad: {
      name: input.adName,
      status: "PAUSED",
      creative: {
        object_story_spec: {
          page_id: "YOUR_PAGE_ID",
          link_data: {
            message: primaryText,
            name: headline,
            description,
            link: input.link,
            call_to_action: { type: input.cta, value: { link: input.link } },
          },
        },
      },
    },
    adflank: {
      audience: peopleLike(ctx.competitor),
      brand: ctx.brand,
      competitor: ctx.competitor,
      interestFallbacks: Object.fromEntries(input.interests.map((i) => [i.name, i.fallbackCategory])),
      cites: ctx.cites,
    },
  };

  const csv = () => {
    const gender = input.genders?.length === 1 ? (input.genders[0] === 1 ? "Men" : "Women") : "All";
    const row = {
      "Campaign Name": input.campaignName,
      "Campaign Status": "PAUSED",
      "Campaign Objective": input.objective,
      "Special Ad Categories": input.specialAdCategories.join(", "),
      "Ad Set Name": input.adSetName,
      "Ad Set Daily Budget": (input.dailyBudgetCents / 100).toFixed(2),
      Countries: input.countries.join(", "),
      Cities: input.cities.map((c) => `${c.name}, ${c.countryCode} (+${c.radius} ${c.distanceUnit === "mile" ? "mi" : "km"})`).join("; "),
      Gender: gender,
      "Age Min": input.ageMin,
      "Age Max": input.ageMax,
      "Flexible Inclusions": input.interests.length ? JSON.stringify([{ interests: input.interests.map((i) => ({ id: "LOOKUP_REQUIRED", name: i.name })) }]) : "",
      "Publisher Platforms": input.publisherPlatforms.join(", "),
      "Ad Name": input.adName,
      Title: headline,
      Body: primaryText,
      "Link Description": description,
      Link: input.link,
      "Call to Action": input.cta,
    };
    return { filename: csvFilename("meta", ctx.runId), content: toCsv(IMPORT_HEADER, [row]) };
  };

  return finish("meta", ctx, json, is.list, csv);
}

export function metaTemplate(pkg: AttackPackage, opts: { landingUrl?: string } = {}): PlatformTemplate {
  const { input, cites } = planMeta(pkg, opts);
  const t = buildMeta(input, contextFrom(pkg, cites));
  t.issues.push(...skippedPlacesIssues("adset.targeting.geo_locations", plannedPlaces(pkg).skipped));
  return t;
}
