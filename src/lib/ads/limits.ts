// Platform limits for the ad templates. Every limit carries the page it was checked against.
// "unverified" marks values we could not find on an official page (see ADS_SPEC.md); they are
// still enforced, at the severity given, so nothing silently exceeds a plausible platform cap.

export const SOURCES = {
  googleRsa: "https://support.google.com/google-ads/answer/7684791",
  googleKeyword: "https://developers.google.com/google-ads/api/reference/rpc/v25/KeywordInfo",
  googleTrademark: "https://support.google.com/adspolicy/answer/6118",
  googleEditorial: "https://support.google.com/adspolicy/answer/6021546",
  metaCampaign: "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group",
  metaTargeting: "https://developers.facebook.com/docs/marketing-api/audiences/reference/basic-targeting",
  metaCta: "https://developers.facebook.com/docs/marketing-api/reference/ad-creative-link-data-call-to-action",
  metaFeedGuide: "https://www.facebook.com/business/ads-guide/update/image/facebook-feed",
  metaAdStandards: "https://transparency.meta.com/policies/ad-standards/",
  tiktokVideoSpecs: "https://ads.tiktok.com/help/article/video-ads-specifications",
  tiktokInFeed: "https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads",
} as const;

export interface LengthLimit {
  min?: number;
  max: number;
  severity: "error" | "warn";
  /** Count CJK (double-width) characters as 2. */
  cjkDouble: boolean;
  source: string;
  verified: boolean;
}

export const GOOGLE = {
  // "Headlines: up to 30 characters" / "3 to 15 headlines" — support.google.com/google-ads/answer/7684791
  headline: { min: 1, max: 30, severity: "error", cjkDouble: true, source: SOURCES.googleRsa, verified: true } satisfies LengthLimit,
  headlineCount: { min: 3, max: 15, source: SOURCES.googleRsa },
  // "Descriptions: up to 90 characters" / "2 to 4 descriptions" — support.google.com/google-ads/answer/7684791
  description: { min: 1, max: 90, severity: "error", cjkDouble: true, source: SOURCES.googleRsa, verified: true } satisfies LengthLimit,
  descriptionCount: { min: 2, max: 4, source: SOURCES.googleRsa },
  // "Path: up to 15 characters" (two path fields) — support.google.com/google-ads/answer/7684791
  path: { max: 15, severity: "error", cjkDouble: true, source: SOURCES.googleRsa, verified: true } satisfies LengthLimit,
  // "double width language like Korean, Japanese, or Chinese counts as 2 characters" — answer/7684791
  cjkCountsDouble: { source: SOURCES.googleRsa },
  // KeywordInfo.text: 80 characters and 10 words. Seen only in search snippets of the API reference
  // (developers.google.com/google-ads/api/reference/rpc/v25/KeywordInfo); the page is too large to fetch. UNVERIFIED.
  keyword: { min: 1, max: 80, severity: "error", cjkDouble: false, source: SOURCES.googleKeyword, verified: false } satisfies LengthLimit,
  keywordWords: { max: 10, source: SOURCES.googleKeyword, verified: false },
  // Competitor trademarks go in keywords only, never in ad text — support.google.com/adspolicy/answer/6118 (not fetched).
  trademarkInText: { severity: "error", source: SOURCES.googleTrademark, verified: false },
  // Editorial: no "!" in headlines — support.google.com/adspolicy/answer/6021546 (not fetched).
  exclamationInHeadline: { severity: "warn", source: SOURCES.googleEditorial, verified: false },
} as const;

export const META = {
  // ODAX objectives — developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
  objectives: [
    "OUTCOME_APP_PROMOTION", "OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT",
    "OUTCOME_LEADS", "OUTCOME_SALES", "OUTCOME_TRAFFIC",
  ] as const,
  // special_ad_categories is required on every campaign ([] = none) — same page.
  specialAdCategoriesRequired: { source: SOURCES.metaCampaign },
  // age_min must be at least 13 (default 18) — developers.facebook.com/docs/marketing-api/audiences/reference/basic-targeting
  ageMin: { min: 13, default: 18, source: SOURCES.metaTargeting },
  // age_max must be at most 65 — basic-targeting
  ageMax: { max: 65, source: SOURCES.metaTargeting },
  // genders: [1] male, [2] female, omitted = all — basic-targeting
  genders: [1, 2] as const,
  // at least one country unless a Custom Audience is used — basic-targeting
  countriesMin: { min: 1, source: SOURCES.metaTargeting },
  // regions: up to 200 — basic-targeting
  regionsMax: { max: 200, source: SOURCES.metaTargeting },
  // cities: up to 250, radius 10-50 mi or 17-80 km — basic-targeting
  citiesMax: { max: 250, source: SOURCES.metaTargeting },
  cityRadiusMile: { min: 10, max: 50, source: SOURCES.metaTargeting },
  cityRadiusKm: { min: 17, max: 80, source: SOURCES.metaTargeting },
  // call_to_action.type: 116 values; we allowlist link-ad CTAs that suit conquesting —
  // developers.facebook.com/docs/marketing-api/reference/ad-creative-link-data-call-to-action
  ctas: [
    "LEARN_MORE", "SHOP_NOW", "SIGN_UP", "SUBSCRIBE", "GET_OFFER",
    "BOOK_NOW", "ORDER_NOW", "CONTACT_US", "APPLY_NOW", "SEE_MORE",
  ] as const,
  // Feed image ads: "Primary Text: 50-150 characters" — a recommendation (truncation), so warn only.
  // facebook.com/business/ads-guide/update/image/facebook-feed
  primaryText: { min: 50, max: 150, severity: "warn", cjkDouble: false, source: SOURCES.metaFeedGuide, verified: true } satisfies LengthLimit,
  // "Headline: 27 characters" — recommendation, warn only. Same guide.
  headline: { min: 1, max: 27, severity: "warn", cjkDouble: false, source: SOURCES.metaFeedGuide, verified: true } satisfies LengthLimit,
  // Description: no figure on Meta's guide; 30 is a third-party convention. Warn only, UNVERIFIED.
  description: { max: 30, severity: "warn", cjkDouble: false, source: SOURCES.metaFeedGuide, verified: false } satisfies LengthLimit,
  // Naming a competitor's trademark in ad text: Meta Advertising Standards (IP) — not fetched; warn only.
  trademarkInText: { severity: "warn", source: SOURCES.metaAdStandards, verified: false },
} as const;

export const TIKTOK = {
  // ad_text: 1-100 Latin / 1-50 CJK. Not on TikTok's official help pages (video-ads-specifications,
  // tiktok-auction-in-feed-ads); every third-party guide says 100 Latin / 50 Asian. Counted with CJK = 2
  // so pure-CJK text caps at 50. Enforced as error, UNVERIFIED.
  adText: { min: 1, max: 100, severity: "error", cjkDouble: true, source: SOURCES.tiktokVideoSpecs, verified: false } satisfies LengthLimit,
  // Display name: "a maximum of 10 characters (Chinese, Japanese, and Korean) or 20 characters in other languages"
  // — ads.tiktok.com/help/article/video-ads-specifications
  displayName: { min: 1, max: 20, severity: "error", cjkDouble: true, source: SOURCES.tiktokVideoSpecs, verified: true } satisfies LengthLimit,
  // Non-Spark captions do "not support any clickable links, symbols (@), or hashtags" — video-ads-specifications
  noLinksMentionsHashtags: { severity: "error", source: SOURCES.tiktokVideoSpecs, verified: true },
  // Spark captions: "A maximum of 4 lines can be displayed, including emojis" — video-ads-specifications
  sparkMaxLines: { max: 4, source: SOURCES.tiktokVideoSpecs },
  // Business API v1.3 enums (from memory, not re-verified against business-api.tiktok.com).
  ageGroups: ["AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"] as const,
  genders: ["GENDER_UNLIMITED", "GENDER_MALE", "GENDER_FEMALE"] as const,
  ctas: ["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "ORDER_NOW", "BOOK_NOW", "CONTACT_US", "APPLY_NOW", "SUBSCRIBE"] as const,
} as const;

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿！-｠￠-￦]/u;

/** True for a double-width (CJK) character. */
export function isDoubleWidth(ch: string): boolean {
  return CJK.test(ch);
}

/**
 * Length as the platform counts it: one per code point, or two per CJK character when `cjkDouble`
 * (Google: "Every character in a double width language like Korean, Japanese, or Chinese counts as 2").
 */
export function textLength(text: string, cjkDouble = true): number {
  let n = 0;
  for (const ch of text) n += cjkDouble && isDoubleWidth(ch) ? 2 : 1;
  return n;
}

export function hasDoubleWidth(text: string): boolean {
  for (const ch of text) if (isDoubleWidth(ch)) return true;
  return false;
}

/** Word count as Google counts keyword words (whitespace-separated). */
export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/u).length : 0;
}
