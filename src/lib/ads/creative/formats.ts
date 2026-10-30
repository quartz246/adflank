/**
 * Creative formats and safe zones (pixels on the exported image). Shared by the server renderer and the mockups.
 * Safe zones keep the hook, logo and CTA clear of the platform UI that sits on top of the image:
 * - Meta feed 1:1 and 4:5: no overlay, a 6% margin. https://www.facebook.com/business/ads-guide/update/image/facebook-feed
 * - 9:16 Stories / Reels / TikTok in-feed: the top ~14% (profile, progress bar), the bottom ~25% (caption, CTA button)
 *   and the right ~15% (like/comment/share rail) are covered. https://ads.tiktok.com/help/article/video-ads-specifications
 */
export type CreativeFormat = "sq" | "pt" | "st";
export type CreativeVariant = "bold" | "editorial" | "type";

export interface FormatSpec {
  w: number;
  h: number;
  label: string;
  platform: string;
  safe: { top: number; right: number; bottom: number; left: number };
}

export const FORMATS: Record<CreativeFormat, FormatSpec> = {
  sq: { w: 1080, h: 1080, label: "Feed 1:1", platform: "Meta feed", safe: { top: 72, right: 72, bottom: 72, left: 72 } },
  pt: { w: 1080, h: 1350, label: "Feed 4:5", platform: "Meta feed", safe: { top: 80, right: 80, bottom: 80, left: 80 } },
  st: { w: 1080, h: 1920, label: "Story 9:16", platform: "Stories · Reels · TikTok", safe: { top: 270, right: 190, bottom: 560, left: 72 } },
};

export const VARIANTS: readonly CreativeVariant[] = ["bold", "editorial", "type"];
export const VARIANT_LABEL: Record<CreativeVariant, string> = { bold: "Statement", editorial: "Editorial", type: "Type poster" };

export function isFormat(s: string | null): s is CreativeFormat {
  return s === "sq" || s === "pt" || s === "st";
}
export function isVariant(s: string | null): s is CreativeVariant {
  return s === "bold" || s === "editorial" || s === "type";
}

/** Meta call-to-action types shown as button labels. */
export const CTA_LABEL: Record<string, string> = {
  SHOP_NOW: "Shop now", LEARN_MORE: "Learn more", SIGN_UP: "Sign up", ORDER_NOW: "Order now", BOOK_NOW: "Book now",
  GET_OFFER: "Get offer", SUBSCRIBE: "Subscribe", CONTACT_US: "Contact us", DOWNLOAD: "Download", APPLY_NOW: "Apply now",
};

/** URL of a rendered creative (PNG, served by /go/[id]/campaign/creative). */
export function creativeUrl(projectId: number, seg: number, fmt: CreativeFormat, v: CreativeVariant, rev = "t", download = false): string {
  return `/go/${projectId}/campaign/creative?s=${seg}&f=${fmt}&v=${v}&c=${encodeURIComponent(rev)}${download ? "&dl=1" : ""}`;
}
