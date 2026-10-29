import { describe, expect, it } from "vitest";
import { GOOGLE, META, SOURCES, TIKTOK, textLength, wordCount } from "@/lib/ads/limits";
import { cleanText, firstFit, fitClause, hardCut, isAdjective, isTargetableTag, peopleLike, stripTikTokSymbols, titleCase } from "@/lib/ads/copy";
import { csvCell, toCsv } from "@/lib/ads/csv";
import { ageSpan, genderSkew, plannedPlaces } from "@/lib/ads/context";
import { SYNTHETIC_PACKAGE as PKG } from "@/lib/ads/fixtures/synthetic";
import { mentions } from "@/lib/ads/validate";

describe("textLength (CJK counts 2)", () => {
  it("counts Latin as 1 per character", () => expect(textLength("abc")).toBe(3));
  it("counts Chinese, Japanese and Korean as 2", () => {
    expect(textLength("中文")).toBe(4);
    expect(textLength("ひらがな")).toBe(8);
    expect(textLength("カタカナ")).toBe(8);
    expect(textLength("한국어")).toBe(6);
  });
  it("counts mixed text and fullwidth punctuation", () => expect(textLength("Aの、")).toBe(5));
  it("counts single-width when cjkDouble is off", () => expect(textLength("中文", false)).toBe(2));
  it("counts an emoji as one code point", () => expect(textLength("☕")).toBe(1));
});

describe("wordCount", () => {
  it("splits on whitespace", () => {
    expect(wordCount("a b  c")).toBe(3);
    expect(wordCount("  ")).toBe(0);
  });
});

describe("every limit cites a source URL", () => {
  it("has https sources", () => {
    for (const url of Object.values(SOURCES)) expect(url).toMatch(/^https:\/\//);
    for (const lim of [GOOGLE.headline, GOOGLE.description, GOOGLE.path, GOOGLE.keyword, META.primaryText, META.headline, META.description, TIKTOK.adText, TIKTOK.displayName]) {
      expect(Object.values(SOURCES)).toContain(lim.source);
    }
  });
  it("records the agreed numbers", () => {
    expect([GOOGLE.headline.max, GOOGLE.description.max, GOOGLE.path.max, GOOGLE.keyword.max, GOOGLE.keywordWords.max]).toEqual([30, 90, 15, 80, 10]);
    expect([GOOGLE.headlineCount.min, GOOGLE.headlineCount.max, GOOGLE.descriptionCount.min, GOOGLE.descriptionCount.max]).toEqual([3, 15, 2, 4]);
    expect([META.ageMin.min, META.ageMax.max, META.citiesMax.max, META.regionsMax.max]).toEqual([13, 65, 250, 200]);
    expect([TIKTOK.adText.max, TIKTOK.displayName.max]).toEqual([100, 20]);
  });
});

describe("copy helpers", () => {
  it("uses the people-like wording", () => expect(peopleLike("Acme")).toBe("people like Acme's customers"));
  it("cleans control chars, angle brackets and formula prefixes", () => {
    expect(cleanText("=HYPERLINK(1)")).toBe("HYPERLINK(1)");
    expect(cleanText("  a\n\tb <script> ")).toBe("a b script");
  });
  it("fitClause keeps whole clauses only", () => {
    expect(fitClause("Short one", 30)).toBe("Short one");
    expect(fitClause("Spin a record, pour a slow cup: coffee for vinyl lovers.", 30)).toBe("Spin a record, pour a slow cup");
    expect(fitClause("abcdefghijklmnopqrstuvwxyz abcdefghij", 30)).toBeNull();
  });
  it("firstFit skips candidates that do not fit", () => expect(firstFit(["x".repeat(31), "ok"], 30)).toBe("ok"));
  it("hardCut respects CJK width", () => expect(hardCut("日本語テキスト", 5)).toBe("日本"));
  it("strips links, mentions and hashtags for TikTok", () => expect(stripTikTokSymbols("Hi @you #tag https://x.y/z")).toBe("Hi you tag"));
  it("title-cases lowercase words only", () => {
    expect(titleCase("Athletic performance")).toBe("Athletic Performance");
    expect(titleCase("hip-hop VISA iPhone")).toBe("Hip-Hop VISA iPhone");
  });
  it("tells adjectives from nouns", () => {
    expect(["active", "Stylish", "dynamic"].map(isAdjective)).toEqual([true, true, true]);
    expect(["Music", "Basketball", "professional sports", "Entertainment"].map(isAdjective)).toEqual([false, false, false, false]);
  });
  it("drops venue tags by tag domain and by text", () => {
    expect(isTargetableTag("Tataki Atun", "urn:tag:specialty_dish:place:tataki_atun")).toBe(false);
    expect(isTargetableTag("Hotel", "urn:tag:genre:place:hotel")).toBe(false);
    expect(isTargetableTag("Expensive")).toBe(false);
    expect(isTargetableTag("Hip Hop", "urn:tag:genre:music:hip_hop")).toBe(true);
  });
  it("matches whole-word mentions only", () => {
    expect(mentions("Better than Acme today", "acme")).toBe(true);
    expect(mentions("Acmeville rocks", "Acme")).toBe(false);
  });
});

describe("audience helpers", () => {
  it("targets the span of over-indexed bands (affinity index input)", () => {
    const s = ageSpan([{ band: "18-24", share: -0.1 }, { band: "25-34", share: 0.3 }, { band: "35-44", share: 0.1 }, { band: "55+", share: -0.2 }]);
    expect([s.min, s.max]).toEqual([25, 44]);
  });
  it("falls back to 70% coverage when given population shares", () => {
    const s = ageSpan([{ band: "18-24", share: 0.1 }, { band: "25-34", share: 0.4 }, { band: "35-44", share: 0.3 }, { band: "55+", share: 0.2 }]);
    expect([s.min, s.max]).toEqual([25, 44]);
  });
  it("maps 55+ to 65 and defaults to 18-65", () => {
    expect(ageSpan([{ band: "55+", share: 0.4 }, { band: "18-24", share: -0.3 }])).toMatchObject({ min: 55, max: 65 });
    expect(ageSpan([])).toMatchObject({ min: 18, max: 65 });
    expect(ageSpan([{ band: "25-34", share: -0.1 }])).toMatchObject({ min: 18, max: 65 });
  });
  it("skews gender only when the gap is above 0.3", () => {
    expect(genderSkew(0.4, -0.2)).toBe("female");
    expect(genderSkew(0.1, -0.1)).toBe("all");
    expect(genderSkew(0.7, 0.3)).toBe("female");
    expect(genderSkew(0.64, 0.36)).toBe("all");
    expect(genderSkew(-0.3, 0.2)).toBe("male");
    expect(genderSkew(undefined, 0.9)).toBe("all");
  });
  it("skips untargetable 'near' points and labels cities with their region", () => {
    const p = plannedPlaces(PKG);
    expect(p.cities.map((c) => c.name)).toEqual(["Austin, Texas", "Denver, Colorado", "Portland, Oregon"]);
    expect(p.regions).toEqual([]);
    expect(p.skipped).toBe(1);
    expect(p.countries).toEqual([]); // US is covered by its cities: no overlapping country target
  });
});

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("x\ny")).toBe('"x\ny"');
  });
  it("neutralises formulas", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-20% today")).toBe("-20% today");
  });
  it("writes header plus rows with CRLF", () => expect(toCsv(["A", "B"], [{ A: 1 }])).toBe("A,B\r\n1,\r\n"));
});
