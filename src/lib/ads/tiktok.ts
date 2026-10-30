import { z } from "zod";
import type { AttackPackage, PlatformTemplate } from "@/lib/types/attack";
import { TIKTOK, textLength } from "./limits";
import { Issues } from "./validate";
import { cleanText, copyBank, firstFit, fitClause, hardCut, peopleLike, stripTikTokSymbols, possessive } from "./copy";
import {
  PLACEHOLDER_URL, skippedPlacesIssues, ageSpan, checkTrademark, contextFrom, finish, genderSkew, plannedPlaces,
  zName, zPlace, zText, zUrl, type BuildContext,
} from "./context";

const BAND_TO_GROUP = {
  "18-24": "AGE_18_24", "25-34": "AGE_25_34", "35-44": "AGE_35_44", "45-54": "AGE_45_54", "55+": "AGE_55_100",
} as const;

export const TIKTOK_OBJECTIVES = ["TRAFFIC", "REACH", "VIDEO_VIEWS", "ENGAGEMENT", "WEB_CONVERSIONS", "LEAD_GENERATION"] as const;

/** Creative brief for the video: TikTok ads are video-first, so the template ships a shot plan. */
export const TikTokBriefSchema = z.strictObject({
  hook: zText(300),
  scenes: z.array(zText(300)).max(8),
  onScreenText: z.array(zText(120)).max(8),
  sound: zText(200),
  creators: z.array(zText(120)).max(5),
  cta: zText(120),
});

/** Input of the TikTok (campaign / ad group / ad + creative brief) builder. */
export const TikTokInputSchema = z.strictObject({
  campaignName: zName,
  objectiveType: z.enum(TIKTOK_OBJECTIVES),
  dailyBudget: z.number().positive().max(100_000),
  adgroupName: zName,
  locations: z.array(zPlace).max(300),
  ageGroups: z.array(z.enum(TIKTOK.ageGroups)).max(5),
  gender: z.enum(TIKTOK.genders),
  interestKeywords: z.array(z.string().trim().min(1).max(120)).max(50),
  creatorBehaviors: z.array(z.string().trim().min(1).max(120)).max(20),
  adName: zName,
  adText: zText(1000),
  displayName: zText(200),
  cta: z.enum(TIKTOK.ctas),
  landingPageUrl: zUrl,
  /** Spark Ads (boosted organic posts) allow hashtags and mentions; standard in-feed ads do not. */
  spark: z.boolean(),
  brief: TikTokBriefSchema,
});
export type TikTokInput = z.infer<typeof TikTokInputSchema>;

export function planTikTok(pkg: AttackPackage, opts: { landingUrl?: string } = {}): { input: TikTokInput; cites: string[] } {
  const b = copyBank(pkg);
  const places = plannedPlaces(pkg);
  const span = ageSpan(pkg.who.ages);
  const skew = genderSkew(pkg.who.female, pkg.who.male);
  const cites: string[] = [pkg.who.cite];

  const g0 = b.gaps[0]?.label, g1 = b.gaps[1]?.label;
  const lead = stripTikTokSymbols(b.angles[0] ?? (g0 ? `For people who love ${g0}.` : `Meet ${b.brand}.`));
  const adText = firstFit([`${lead} Try ${b.brand}.`, lead], TIKTOK.adText.max) ?? fitClause(lead, TIKTOK.adText.max) ?? hardCut(lead, TIKTOK.adText.max);
  const displayName = firstFit([b.brand], TIKTOK.displayName.max) ?? hardCut(b.brand, TIKTOK.displayName.max);

  const creators = [...pkg.creators].sort((a, b2) => b2.affinity - a.affinity)
    .filter((c) => c.kind === "podcast" || c.kind === "artist" || c.kind === "person" || c.kind === "tv_show").slice(0, 3);
  for (const c of creators) cites.push(c.cite);
  const interests = b.interests.slice(0, 6);
  for (const i of interests) cites.push(i.cite);
  for (const g of b.gaps.slice(0, 2)) cites.push(g.cite);
  for (const w of [...places.cities, ...places.regions]) cites.push(w.cite);

  const brief: TikTokInput["brief"] = {
    hook: cleanText(g0 ? `First 2 seconds: a real ${g0.toLocaleLowerCase()} moment, no logo yet.` : `First 2 seconds: the product in use, no logo yet.`),
    scenes: [
      cleanText(`Creator talks to camera about ${g0 ?? "what they love"}${g1 ? ` and ${g1}` : ""}.`),
      cleanText(`Show ${b.brand} fitting into that moment (product in hand, real setting${b.topCity ? `, ${b.topCity}` : ""}).`),
      cleanText(`End card: ${b.brand} logo and the CTA.`),
    ],
    onScreenText: [g0, g1, `Try ${b.brand}`].filter((s): s is string => !!s).map((s) => hardCut(s, 40)),
    sound: "Trending, upbeat track from the TikTok Commercial Music Library.",
    creators: creators.map((c) => cleanText(c.name)),
    cta: "LEARN_MORE",
  };

  const input: TikTokInput = {
    campaignName: `AdFlank | ${b.brand} vs ${b.competitor}`.slice(0, 255),
    objectiveType: "TRAFFIC",
    dailyBudget: 50,
    adgroupName: `People like ${possessive(b.competitor)} customers`.slice(0, 255),
    locations: [
      ...places.cities.map((w) => ({ name: w.name, countryCode: w.countryCode })),
      ...places.regions.map((w) => ({ name: w.name, countryCode: w.countryCode })),
      ...places.countries.map((c) => ({ name: c, countryCode: c })),
    ],
    ageGroups: span.bands.map((band) => BAND_TO_GROUP[band]),
    gender: skew === "female" ? "GENDER_FEMALE" : skew === "male" ? "GENDER_MALE" : "GENDER_UNLIMITED",
    interestKeywords: interests.map((i) => cleanText(i.name)),
    creatorBehaviors: creators.map((c) => cleanText(c.name)),
    adName: `${b.brand} | ${g0 ?? "switch"}`.slice(0, 255),
    adText,
    displayName,
    cta: "LEARN_MORE",
    landingPageUrl: opts.landingUrl ?? PLACEHOLDER_URL,
    spark: false,
    brief,
  };
  return { input, cites };
}

export function buildTikTok(raw: TikTokInput, ctx: BuildContext): PlatformTemplate {
  const input = TikTokInputSchema.parse(raw);
  const is = new Issues();
  const adText = cleanText(input.adText), displayName = cleanText(input.displayName);

  is.length("ad.ad_text", "Ad text", adText, TIKTOK.adText);
  if (!input.spark) {
    if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co)\b/i.test(adText)) is.error("ad.ad_text", `Ad text contains a link; non-Spark TikTok captions do not allow links. Source: ${TIKTOK.noLinksMentionsHashtags.source}`);
    if (adText.includes("@")) is.error("ad.ad_text", `Ad text contains "@"; non-Spark TikTok captions do not allow mentions. Source: ${TIKTOK.noLinksMentionsHashtags.source}`);
    if (adText.includes("#")) is.error("ad.ad_text", `Ad text contains "#"; non-Spark TikTok captions do not allow hashtags. Source: ${TIKTOK.noLinksMentionsHashtags.source}`);
  } else if (input.adText.split(/\r?\n/).length > TIKTOK.sparkMaxLines.max) {
    is.warn("ad.ad_text", `Spark caption has more than ${TIKTOK.sparkMaxLines.max} lines; only 4 are shown. Source: ${TIKTOK.sparkMaxLines.source}`);
  }
  checkTrademark(is, "ad.ad_text", adText, ctx.competitor, "warn", TIKTOK.noLinksMentionsHashtags.source);
  is.length("ad.display_name", "Display name", displayName, TIKTOK.displayName);

  if (!input.locations.length) is.error("adgroup.location_ids", "No location: a TikTok ad group needs at least one location.");
  else is.warn("adgroup.location_ids", `${input.locations.length} location id(s) need TikTok's location search before upload; ids are LOOKUP_REQUIRED.`);
  if (input.interestKeywords.length || input.creatorBehaviors.length) {
    is.warn("adgroup.interest_keyword_ids", "Interest and behavior ids need TikTok's targeting search before upload; ids are LOOKUP_REQUIRED.");
  }
  if (!input.ageGroups.length) is.warn("adgroup.age_groups", "No age groups: the ad group would target all ages 18+.");
  if (input.landingPageUrl === PLACEHOLDER_URL) is.warn("ad.landing_page_url", "Landing page is a placeholder; set the brand's URL before upload.");
  is.warn("ad.video_id", "Upload a video made from the creative brief; video_id is UPLOAD_REQUIRED.");

  const json = {
    campaign: {
      campaign_name: input.campaignName,
      objective_type: input.objectiveType,
      budget_mode: "BUDGET_MODE_DAY",
      budget: input.dailyBudget,
      operation_status: "DISABLE",
    },
    adgroup: {
      adgroup_name: input.adgroupName,
      placement_type: "PLACEMENT_TYPE_NORMAL",
      placements: ["PLACEMENT_TIKTOK"],
      location_ids: input.locations.map(() => "LOOKUP_REQUIRED"),
      location_names: input.locations.map((l) => (l.name === l.countryCode ? l.countryCode : `${l.name}, ${l.countryCode}`)),
      age_groups: input.ageGroups,
      gender: input.gender,
      interest_keyword_ids: input.interestKeywords.map(() => "LOOKUP_REQUIRED"),
      interest_keywords: input.interestKeywords,
      actions: input.creatorBehaviors.length
        ? [{ action_scene: "CREATOR_RELATED", action_period: 15, video_user_actions: ["FOLLOWING", "VIEW_HOMEPAGE"], action_category_ids: ["LOOKUP_REQUIRED"], creators: input.creatorBehaviors }]
        : [],
      budget_mode: "BUDGET_MODE_DAY",
      budget: input.dailyBudget,
      schedule_type: "SCHEDULE_FROM_NOW",
      optimization_goal: "CLICK",
      billing_event: "CPC",
      operation_status: "DISABLE",
    },
    ad: {
      ad_name: input.adName,
      ad_format: "SINGLE_VIDEO",
      ad_text: adText,
      display_name: displayName,
      call_to_action: input.cta,
      landing_page_url: input.landingPageUrl,
      identity_type: "CUSTOMIZED_USER",
      video_id: "UPLOAD_REQUIRED",
      operation_status: "DISABLE",
    },
    creative_brief: input.brief,
    adflank: {
      audience: peopleLike(ctx.competitor),
      brand: ctx.brand,
      competitor: ctx.competitor,
      ad_text_length: textLength(adText, true),
      cites: ctx.cites,
    },
  };
  // TikTok has no public bulk-CSV spec: JSON only, never a CSV presented as an upload file.
  return finish("tiktok", ctx, json, is.list, undefined);
}

export function tiktokTemplate(pkg: AttackPackage, opts: { landingUrl?: string } = {}): PlatformTemplate {
  const { input, cites } = planTikTok(pkg, opts);
  const t = buildTikTok(input, contextFrom(pkg, cites));
  t.issues.push(...skippedPlacesIssues("adgroup.location_ids", plannedPlaces(pkg).skipped));
  return t;
}
