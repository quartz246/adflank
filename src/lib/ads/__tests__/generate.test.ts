import { describe, expect, it } from "vitest";
import { AD_TOOLS, adToolJsonSchemas, generateTemplates, runAdTool } from "@/lib/ads";
import { mentions } from "@/lib/ads/validate";
import { SYNTHETIC_PACKAGE as PKG, SYNTHETIC_PACKAGE_JA as JA } from "@/lib/ads/fixtures/synthetic";

describe("generateTemplates on the synthetic package", () => {
  const ts = generateTemplates(PKG);
  it("returns one template per platform in order", () => {
    expect(ts.map((t) => t.platform)).toEqual(["meta", "tiktok", "google"]);
    for (const t of ts) expect(t.packageRunId).toBe(PKG.runId);
  });
  it("has no error issues", () => {
    for (const t of ts) expect(t.issues.filter((i) => i.severity === "error")).toEqual([]);
  });
  it("exports CSV for Meta and Google only", () => {
    expect(ts.map((t) => !!t.csv)).toEqual([true, false, true]);
    expect(ts[2].csv!.content.split("\r\n")[0]).toContain("Headline 15,Description 1");
  });
  it("cites only calls in the package, and cites something", () => {
    for (const t of ts) {
      expect(t.cites.length).toBeGreaterThan(0);
      for (const c of t.cites) expect(PKG.citations[c]).toBeDefined();
    }
  });
  it("keeps the competitor in keywords, never in RSA text", () => {
    const g = ts[2].json as { ad_group_ad: { ad: { responsive_search_ad: { headlines: { text: string }[]; descriptions: { text: string }[] } } }; keywords: { text: string }[] };
    const rsa = g.ad_group_ad.ad.responsive_search_ad;
    for (const x of [...rsa.headlines, ...rsa.descriptions]) expect(mentions(x.text, PKG.competitor.name)).toBe(false);
    expect(g.keywords.some((k) => k.text === "kettle & crane coffee")).toBe(true);
    expect(g.keywords.some((k) => k.text === "brands like kettle & crane coffee")).toBe(true);
    // Interests and gap hooks target through the custom segment, not as bare search keywords.
    expect(g.keywords.some((k) => k.text === "trail running")).toBe(false);
    const seg = (ts[2].json as { audience_segments: { members: { keyword: string }[] }[] }).audience_segments[0].members.map((m) => m.keyword);
    expect(seg).toEqual(expect.arrayContaining(["Specialty coffee", "Trail running", "Oat milk"]));
    expect(rsa.headlines.length).toBeGreaterThanOrEqual(3);
    expect(rsa.descriptions.length).toBeGreaterThanOrEqual(2);
  });
  it("uses the people-like wording for the audience", () => {
    for (const t of ts) expect(JSON.stringify(t.json)).toContain("people like Kettle & Crane Coffee's customers");
  });
  it("warns about the Qloo location that could not be targeted", () => {
    for (const t of ts) expect(t.issues.some((i) => i.message.includes("1 Qloo location(s) had no nearby city"))).toBe(true);
  });
  it("targets ages 25-44 from the over-indexed bands", () => {
    const m = ts[0].json as { adset: { targeting: { age_min: number; age_max: number; genders?: number[] } } };
    expect([m.adset.targeting.age_min, m.adset.targeting.age_max]).toEqual([25, 44]);
    expect(m.adset.targeting.genders).toBeUndefined();
  });
  it("is deterministic", () => expect(JSON.stringify(generateTemplates(PKG))).toBe(JSON.stringify(ts)));
});

describe("CJK package", () => {
  it("stays within double-width limits and warns about English phrases", () => {
    const ts = generateTemplates(JA);
    for (const t of ts) {
      expect(t.issues.filter((i) => i.severity === "error")).toEqual([]);
      expect(t.issues.some((i) => i.field === "copy")).toBe(true);
    }
  });
});

describe("edge packages", () => {
  it("handles an empty package without throwing and reports errors", () => {
    const empty = { ...PKG, where: [], interests: [], gap: [], creators: [], copyAngles: [], locale: { countryCodes: [], language: "en" }, who: { ages: [], cite: "x" } };
    const ts = generateTemplates(empty);
    expect(ts).toHaveLength(3);
    expect(ts[0].csv).toBeUndefined();            // Meta: no location
    expect(ts[1].issues.some((i) => i.severity === "error")).toBe(true); // TikTok: no location
  });
  it("escapes nothing itself but strips markup from copy", () => {
    const evil = { ...PKG, copyAngles: ["<img src=x onerror=alert(1)> Fresh coffee for trail running people"] };
    const s = JSON.stringify(generateTemplates(evil));
    expect(s).not.toContain("<img");
  });
});

describe("real-world tag hygiene", () => {
  const venue = {
    ...PKG,
    interests: [
      { name: "VISA", qlooTagId: "urn:tag:credit_card:place:visa", affinity: 1, cite: "q_synthetic_0001_5" },
      { name: "Tataki Atun", qlooTagId: "urn:tag:specialty_dish:place:tataki_atun", affinity: 1, cite: "q_synthetic_0001_5" },
      { name: "Moderately expensive", affinity: 1, cite: "q_synthetic_0001_5" },
      { name: "Five Star", affinity: 1, cite: "q_synthetic_0001_5" },
      { name: "Hip Hop", qlooTagId: "urn:tag:genre:music:hip_hop", affinity: 1, cite: "q_synthetic_0001_5" },
    ],
    gap: [{ label: "active", theirs: 1, yours: 0, delta: 1, cite: "q_synthetic_0001_7" }],
  };
  const ts = generateTemplates(venue);
  const all = JSON.stringify(ts.map((t) => t.json));
  it("never targets or writes venue tags (dishes, cards, price bands, ratings)", () => {
    for (const bad of ["VISA", "Tataki", "expensive", "Five Star"]) expect(all).not.toContain(bad);
    expect(all).toContain("Hip Hop");
  });
  it("writes adjective hooks as adjectives", () => {
    const h = (ts[2].json as { ad_group_ad: { ad: { responsive_search_ad: { headlines: { text: string }[] } } } }).ad_group_ad.ad.responsive_search_ad.headlines.map((x) => x.text);
    expect(h).toContain("Active by Design");
    expect(h).not.toContain("Love active?");
  });
});

describe("allowlisted builder tools", () => {
  it("exposes three tools with JSON schemas", () => {
    const s = adToolJsonSchemas();
    expect(s.map((x) => x.name)).toEqual(Object.keys(AD_TOOLS));
    expect(JSON.stringify(s)).toContain("headlines");
  });
  it("refuses unknown tools and bad arguments", () => {
    expect(runAdTool("bash", { cmd: "ls" }, PKG)).toEqual({ ok: false, error: "unknown tool" });
    expect(runAdTool("build_meta_template", { cta: "RUN_SHELL" }, PKG).ok).toBe(false);
    expect(runAdTool("build_meta_template", { injected: true }, PKG).ok).toBe(false);
  });
  it("applies valid overrides and validates them", () => {
    const r = runAdTool("build_google_template", { headlines: ["Only two", "headlines"] }, PKG);
    expect(r.ok && r.template.csv).toBeFalsy();
    const ok = runAdTool("build_tiktok_template", { displayName: "Juniper" }, PKG);
    expect(ok.ok && (ok.template.json as { ad: { display_name: string } }).ad.display_name).toBe("Juniper");
  });
});
