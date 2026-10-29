import { describe, expect, it } from "vitest";
import type { PlatformTemplate } from "@/lib/types/attack";
import {
  GoogleInputSchema, MetaInputSchema, TikTokInputSchema, buildGoogle, buildMeta, buildTikTok,
  planGoogle, planMeta, planTikTok, type GoogleInput, type MetaInput, type TikTokInput,
} from "@/lib/ads";
import { contextFrom } from "@/lib/ads/context";
import { SYNTHETIC_PACKAGE as PKG } from "@/lib/ads/fixtures/synthetic";

const errorsOn = (t: PlatformTemplate, field: string | RegExp) =>
  t.issues.filter((i) => i.severity === "error" && (typeof field === "string" ? i.field === field : field.test(i.field)));
const warnsOn = (t: PlatformTemplate, field: string | RegExp) =>
  t.issues.filter((i) => i.severity === "warn" && (typeof field === "string" ? i.field === field : field.test(i.field)));

const L = (n: number) => "a".repeat(n);
const W = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const H = (n: number) => Array.from({ length: n }, (_, i) => `Headline number ${i + 1}`);

function google(over: Partial<GoogleInput>): PlatformTemplate {
  const plan = planGoogle(PKG);
  return buildGoogle({ ...plan.input, ...over }, contextFrom(PKG, plan.cites));
}
function meta(over: Partial<MetaInput>): PlatformTemplate {
  const plan = planMeta(PKG);
  return buildMeta({ ...plan.input, ...over }, contextFrom(PKG, plan.cites));
}
function tiktok(over: Partial<TikTokInput>): PlatformTemplate {
  const plan = planTikTok(PKG);
  return buildTikTok({ ...plan.input, ...over }, contextFrom(PKG, plan.cites));
}

describe("Google RSA limits", () => {
  it("headline 30 ok, 31 error", () => {
    expect(errorsOn(google({ headlines: [L(30), "Two", "Three"] }), "headlines[0]")).toHaveLength(0);
    expect(errorsOn(google({ headlines: [L(31), "Two", "Three"] }), "headlines[0]")).toHaveLength(1);
  });
  it("CJK headline: 15 chars (=30) ok, 16 chars (=32) error", () => {
    expect(errorsOn(google({ headlines: ["日".repeat(15), "Two", "Three"] }), "headlines[0]")).toHaveLength(0);
    expect(errorsOn(google({ headlines: ["日".repeat(16), "Two", "Three"] }), "headlines[0]")).toHaveLength(1);
  });
  it("Korean description: 45 chars ok, 46 error", () => {
    expect(errorsOn(google({ descriptions: ["한".repeat(45), "Two"] }), "descriptions[0]")).toHaveLength(0);
    expect(errorsOn(google({ descriptions: ["한".repeat(46), "Two"] }), "descriptions[0]")).toHaveLength(1);
  });
  it("headline count: 2 error, 3 ok, 15 ok, 16 error", () => {
    expect(errorsOn(google({ headlines: H(2) }), "headlines")).toHaveLength(1);
    expect(errorsOn(google({ headlines: H(3) }), "headlines")).toHaveLength(0);
    expect(errorsOn(google({ headlines: H(15) }), "headlines")).toHaveLength(0);
    expect(errorsOn(google({ headlines: H(16) }), "headlines")).toHaveLength(1);
  });
  it("description 90 ok, 91 error", () => {
    expect(errorsOn(google({ descriptions: [L(90), "Two"] }), "descriptions[0]")).toHaveLength(0);
    expect(errorsOn(google({ descriptions: [L(91), "Two"] }), "descriptions[0]")).toHaveLength(1);
  });
  it("description count: 1 error, 2 ok, 4 ok, 5 error", () => {
    expect(errorsOn(google({ descriptions: ["One"] }), "descriptions")).toHaveLength(1);
    expect(errorsOn(google({ descriptions: ["One", "Two"] }), "descriptions")).toHaveLength(0);
    expect(errorsOn(google({ descriptions: ["1", "2", "3", "4"] }), "descriptions")).toHaveLength(0);
    expect(errorsOn(google({ descriptions: ["1", "2", "3", "4", "5"] }), "descriptions")).toHaveLength(1);
  });
  it("path 15 ok, 16 error (both paths)", () => {
    expect(errorsOn(google({ path1: L(15), path2: L(15) }), /^path/)).toHaveLength(0);
    expect(errorsOn(google({ path1: L(16) }), "path1")).toHaveLength(1);
    expect(errorsOn(google({ path2: L(16) }), "path2")).toHaveLength(1);
  });
  it("keyword 80 chars ok, 81 error", () => {
    expect(errorsOn(google({ keywords: [{ text: L(80), match: "Phrase", negative: false }] }), "keywords[0]")).toHaveLength(0);
    expect(errorsOn(google({ keywords: [{ text: L(81), match: "Phrase", negative: false }] }), "keywords[0]")).toHaveLength(1);
  });
  it("keyword 10 words ok, 11 error", () => {
    expect(errorsOn(google({ keywords: [{ text: W(10), match: "Broad", negative: false }] }), "keywords[0]")).toHaveLength(0);
    expect(errorsOn(google({ keywords: [{ text: W(11), match: "Broad", negative: false }] }), "keywords[0]")).toHaveLength(1);
  });
  it("needs at least one positive keyword", () => {
    expect(errorsOn(google({ keywords: [{ text: "x", match: "Exact", negative: true }] }), "keywords")).toHaveLength(1);
  });
  it("competitor name in RSA text is an error (trademark rule)", () => {
    const t = google({ headlines: ["Beats Kettle & Crane Coffee", "Two", "Three"] });
    expect(errorsOn(t, "headlines[0]").some((i) => i.message.includes("competitor"))).toBe(true);
  });
  it("warns on ! in a headline", () => expect(warnsOn(google({ headlines: ["Wow!", "Two", "Three"] }), "headlines[0]")).toHaveLength(1));
  it("error issues block the CSV", () => {
    expect(google({}).csv).toBeDefined();
    expect(google({ headlines: H(2) }).csv).toBeUndefined();
  });
  it("schema is strict and https-only", () => {
    const plan = planGoogle(PKG).input;
    expect(GoogleInputSchema.safeParse({ ...plan, extra: 1 }).success).toBe(false);
    expect(GoogleInputSchema.safeParse({ ...plan, finalUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("Meta limits", () => {
  it("age_min 12 error, 13 ok", () => {
    expect(errorsOn(meta({ ageMin: 12 }), "adset.targeting.age_min")).toHaveLength(1);
    expect(errorsOn(meta({ ageMin: 13 }), "adset.targeting.age_min")).toHaveLength(0);
  });
  it("age_max 65 ok, 66 error", () => {
    expect(errorsOn(meta({ ageMax: 65 }), "adset.targeting.age_max")).toHaveLength(0);
    expect(errorsOn(meta({ ageMax: 66 }), "adset.targeting.age_max")).toHaveLength(1);
  });
  it("age_min above age_max is an error", () => expect(errorsOn(meta({ ageMin: 40, ageMax: 30 }), "adset.targeting.age_min")).toHaveLength(1));
  it("needs a location", () => {
    expect(errorsOn(meta({ countries: [], regions: [], cities: [] }), "adset.targeting.geo_locations")).toHaveLength(1);
    expect(errorsOn(meta({ countries: ["US"], regions: [], cities: [] }), "adset.targeting.geo_locations")).toHaveLength(0);
  });
  it("cities 250 ok, 251 error", () => {
    const city = { name: "Town", countryCode: "US", radius: 10, distanceUnit: "mile" as const };
    expect(errorsOn(meta({ cities: Array(250).fill(city) }), "adset.targeting.geo_locations.cities")).toHaveLength(0);
    expect(errorsOn(meta({ cities: Array(251).fill(city) }), "adset.targeting.geo_locations.cities")).toHaveLength(1);
  });
  it("regions 200 ok, 201 error", () => {
    const r = { name: "Region", countryCode: "US" };
    expect(errorsOn(meta({ regions: Array(200).fill(r) }), "adset.targeting.geo_locations.regions")).toHaveLength(0);
    expect(errorsOn(meta({ regions: Array(201).fill(r) }), "adset.targeting.geo_locations.regions")).toHaveLength(1);
  });
  it("radius 10-50 miles and 17-80 km", () => {
    const c = (radius: number, distanceUnit: "mile" | "kilometer") => [{ name: "Town", countryCode: "US", radius, distanceUnit }];
    const radiusErr = (t: PlatformTemplate) => errorsOn(t, /cities\[0\]\.radius$/).length;
    expect([9, 10, 50, 51].map((r) => radiusErr(meta({ cities: c(r, "mile") })))).toEqual([1, 0, 0, 1]);
    expect([16, 17, 80, 81].map((r) => radiusErr(meta({ cities: c(r, "kilometer") })))).toEqual([1, 0, 0, 1]);
  });
  it("feed text lengths are warnings, not errors", () => {
    const at = (f: string, t: PlatformTemplate) => [errorsOn(t, f).length, warnsOn(t, f).length];
    expect(at("ad.creative.link_data.name", meta({ headline: L(27) }))).toEqual([0, 0]);
    expect(at("ad.creative.link_data.name", meta({ headline: L(28) }))).toEqual([0, 1]);
    expect(at("ad.creative.link_data.message", meta({ primaryText: L(49) }))).toEqual([0, 1]);
    expect(at("ad.creative.link_data.message", meta({ primaryText: L(50) }))).toEqual([0, 0]);
    expect(at("ad.creative.link_data.message", meta({ primaryText: L(150) }))).toEqual([0, 0]);
    expect(at("ad.creative.link_data.message", meta({ primaryText: L(151) }))).toEqual([0, 1]);
    expect(at("ad.creative.link_data.description", meta({ description: L(31) }))).toEqual([0, 1]);
  });
  it("only allowlisted CTAs and objectives pass the schema", () => {
    const plan = planMeta(PKG).input;
    expect(MetaInputSchema.safeParse({ ...plan, cta: "CALL_NOW" }).success).toBe(false);
    expect(MetaInputSchema.safeParse({ ...plan, objective: "CONVERSIONS" }).success).toBe(false);
    expect(MetaInputSchema.safeParse(plan).success).toBe(true);
  });
  it("always sends special_ad_categories and PAUSED status", () => {
    const j = meta({}).json as { campaign: { special_ad_categories: unknown[]; status: string } };
    expect(j.campaign.special_ad_categories).toEqual([]);
    expect(j.campaign.status).toBe("PAUSED");
  });
  it("interests need lookups and carry a fallback category", () => {
    const t = meta({});
    expect(warnsOn(t, "adset.targeting.flexible_spec")[0].message).toContain("Food and drink");
    expect(JSON.stringify(t.json)).toContain('"id":"LOOKUP_REQUIRED"');
  });
  it("error issues block the CSV", () => {
    expect(meta({}).csv?.content).toContain("Campaign Name,Campaign Status");
    expect(meta({ ageMin: 10 }).csv).toBeUndefined();
  });
});

describe("TikTok limits", () => {
  const adErr = (t: PlatformTemplate) => errorsOn(t, "ad.ad_text").length;
  it("ad_text 100 ok, 101 error, empty error", () => {
    expect(adErr(tiktok({ adText: L(100) }))).toBe(0);
    expect(adErr(tiktok({ adText: L(101) }))).toBe(1);
    expect(adErr(tiktok({ adText: "" }))).toBe(1);
  });
  it("CJK ad_text 50 ok, 51 error", () => {
    expect(adErr(tiktok({ adText: "日".repeat(50) }))).toBe(0);
    expect(adErr(tiktok({ adText: "日".repeat(51) }))).toBe(1);
  });
  it("display name 20 ok / 21 error; CJK 10 ok / 11 error", () => {
    const dn = (t: PlatformTemplate) => errorsOn(t, "ad.display_name").length;
    expect([L(20), L(21), "名".repeat(10), "名".repeat(11)].map((d) => dn(tiktok({ displayName: d })))).toEqual([0, 1, 0, 1]);
  });
  it("no links, @ or # in non-Spark captions", () => {
    expect(adErr(tiktok({ adText: "See www.example.com now" }))).toBe(1);
    expect(adErr(tiktok({ adText: "Hi @friend" }))).toBe(1);
    expect(adErr(tiktok({ adText: "Big #news" }))).toBe(1);
    expect(adErr(tiktok({ adText: "Big #news", spark: true }))).toBe(0);
  });
  it("needs a location", () => expect(errorsOn(tiktok({ locations: [] }), "adgroup.location_ids")).toHaveLength(1));
  it("is JSON only: never a CSV", () => expect(tiktok({}).csv).toBeUndefined());
  it("ships a creative brief and DISABLE status", () => {
    const j = tiktok({}).json as { creative_brief: { scenes: string[] }; campaign: { operation_status: string } };
    expect(j.creative_brief.scenes.length).toBeGreaterThan(0);
    expect(j.campaign.operation_status).toBe("DISABLE");
  });
  it("schema rejects unknown enums", () => {
    const plan = planTikTok(PKG).input;
    expect(TikTokInputSchema.safeParse({ ...plan, ageGroups: ["AGE_13_17"] }).success).toBe(false);
  });
});
