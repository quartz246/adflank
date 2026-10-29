import type { AdPlatform } from "@/lib/types/attack";

export const PLATFORMS: readonly AdPlatform[] = ["meta", "tiktok", "google"];
export const PLATFORM_LABEL: Record<AdPlatform, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };
/** Platforms with a bulk-upload CSV shape. TikTok exports JSON only. */
export const CSV_PLATFORMS: readonly AdPlatform[] = ["meta", "google"];

export function isPlatform(s: string): s is AdPlatform {
  return (PLATFORMS as readonly string[]).includes(s);
}
