import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { BANNED_PHRASES, checkLine, isClean, pickClean } from "@/lib/ads/creative/banned";
import { aboutLine, COPY_LIMITS, copyMessages, mergeGlmCopy, soft, tagKind, templateCopy, type CopyFacts } from "@/lib/ads/creative/copywriter";
import { contrast, dominantColor, onColor, parseIdentity, pngPixels, usableAccent } from "@/lib/ads/creative/brand";
import { fitSize } from "@/lib/ads/creative/render";
import { creativeUrl, FORMATS, isFormat, isVariant } from "@/lib/ads/creative/formats";
import { adWorthy, buildSegments } from "@/lib/campaign/segments";
import { possessive, peopleLike } from "@/lib/ads/copy";
import { SYNTHETIC_PACKAGE } from "@/lib/ads/fixtures/synthetic";

const facts = (over: Partial<CopyFacts> = {}): CopyFacts => ({
  id: "s0", brand: "Juniper Roasters", taste: "Trail Running", gap: true, place: "Portland", audience: "Women 25-34",
  competitors: ["Kettle & Crane Coffee"], index: 0, ...over,
});

describe("banned-phrase filter", () => {
  it.each([
    "Unlock your best mornings.", "Elevate your coffee ritual", "Discover the taste of Portland", "A game-changer for runners",
    "POV: you love trail running", "Take it to the next level.", "Seamless comfort all day", "Made for coffee people.",
    "Embark on a flavour journey", "If coffee is your thing, Juniper is your brand.", "Curated for you",
  ])("rejects stock filler: %s", (line) => expect(isClean(line)).toBe(false));

  it.each(["Join 10,000 runners", "Rated #1 in Portland", "30% off this week", "Best-selling beans", "The world's most comfortable shoe"])(
    "rejects claims we cannot cite: %s", (line) => expect(isClean(line)).toBe(false));

  it("rejects competitor names, hashtags, emoji, shouting and !!", () => {
    const ctx = { forbidNames: ["Kettle & Crane Coffee", "VEJA"] };
    expect(checkLine("Better than Kettle & Crane Coffee", ctx).ok).toBe(false);
    expect(checkLine("Not another veja knock-off", ctx).ok).toBe(false);
    expect(isClean("Coffee, done properly #coffee")).toBe(false);
    expect(isClean("Coffee, done properly 🔥")).toBe(false);
    expect(isClean("COFFEE DONE PROPERLY")).toBe(false);
    expect(isClean("Coffee!! Done!")).toBe(false);
    expect(isClean("[redacted] coffee")).toBe(false);
  });

  it("accepts sharp, specific lines", () => {
    for (const l of ["Less hype. More trail running.", "Packed for the long way round.", "Waxed canvas that shrugs off Portland rain.", "Quietly sustainable."]) expect(checkLine(l).ok, l).toBe(true);
  });

  it("does not fail a line for words inside grounded Qloo labels or brand names", () => {
    expect(isClean("For people who never miss Embrace the Journey.")).toBe(false);
    expect(isClean("For people who never miss Embrace the Journey.", { grounded: ["Embrace the Journey"] })).toBe(true);
    expect(isClean("7-Eleven, done properly.", { grounded: ["7-Eleven"] })).toBe(true);
  });

  it("matches whole words only", () => {
    expect(isClean("Hackney's coffee crowd")).toBe(true); // not "hack"
    expect(isClean("A bestseller list")).toBe(true); // not "best" as a word
  });

  it("pickClean returns the first candidate that is clean and fits", () => {
    expect(pickClean(["Unlock it.", "A".repeat(50), "Less hype. More coffee."], 42)).toBe("Less hype. More coffee.");
    expect(pickClean(["Unlock it."], 42)).toBeNull();
    expect(BANNED_PHRASES.length).toBeGreaterThan(40);
  });
});

describe("copywriter", () => {
  const tastes = ["Trail Running", "Sustainable fashion advocates", "Stylish", "Fair Trade", "Sneaker Enthusiasts", "Environmentalism", "Coffee Shops", "Environmental Sustainability", "NPR"];
  const places = ["Portland", "US", "San Francisco", "near 45.5,-122.6"];

  it("template copy is always within the creative limits and passes the filter", () => {
    for (const [i, taste] of tastes.entries()) for (const place of places) {
      const f = facts({ taste, place, index: i, media: i % 2 ? "The Rachel Hollis Podcast" : undefined, about: i % 3 ? "Small-batch coffee roasted in Portland every Monday." : undefined });
      const c = templateCopy(f);
      for (const k of ["hook", "sub", "primary", "headline", "tiktok"] as const) {
        expect([...c[k]].length, `${k}: ${c[k]}`).toBeLessThanOrEqual(COPY_LIMITS[k]);
        expect(c[k].length, k).toBeGreaterThan(0);
        expect(checkLine(c[k], { forbidNames: f.competitors, grounded: [f.brand, f.taste, f.place, f.media ?? ""] }).ok, `${k}: ${c[k]}`).toBe(true);
      }
      expect(c.hook).not.toMatch(/made for|POV|people people|stylish people|crowd crowd/i);
    }
  });

  it("is grammatical for adjectives and audience tags", () => {
    expect(tagKind("Stylish")).toBe("adj");
    expect(tagKind("Sneaker Enthusiasts")).toBe("people");
    expect(tagKind("Trail Running")).toBe("noun");
    expect(templateCopy(facts({ taste: "Stylish" })).hook).not.toMatch(/more stylish|into stylish/i);
    expect(templateCopy(facts({ taste: "Sneaker Enthusiasts" })).hook).not.toMatch(/love sneaker enthusiasts/i);
    expect(soft("Trail Running")).toBe("trail running");
    expect(soft("NPR")).toBe("NPR");
  });

  it("varies hooks across ads", () => {
    const hooks = new Set([0, 1, 2, 3, 4].map((i) => templateCopy(facts({ index: i })).hook));
    expect(hooks.size).toBeGreaterThanOrEqual(3);
  });

  it("aboutLine strips the brand prefix and refuses superlatives", () => {
    const ctx = {};
    expect(aboutLine("Allbirds: The world's most comfortable shoes, flats, and clothing made with natural materials like merino wool and eucalyptus. FREE shipping.", ctx, "Allbirds")).toBe("Made with natural materials like merino wool and eucalyptus.");
    expect(aboutLine("Juniper Roasters | Small-batch coffee roasted every Monday", ctx, "Juniper Roasters")).toBe("Small-batch coffee roasted every Monday.");
    expect(aboutLine("Unlock the best coffee ever", ctx)).toBeNull();
  });

  it("GLM prompt has few-shot examples and only the brief as data", () => {
    const m = copyMessages("Juniper Roasters", "Small-batch coffee", [facts()]);
    expect(m[0].role).toBe("system");
    expect(m.filter((x) => x.role === "assistant")).toHaveLength(1);
    expect(String(m[0].content)).toMatch(/Banned words/);
    expect(String(m.at(-1)!.content)).toContain("Trail Running");
    expect(JSON.stringify(m)).not.toMatch(/\/home\/|process\.env|API_KEY/);
  });

  it("merges GLM copy field by field: banned, too long or competitor-naming lines fall back to the template", () => {
    const f = facts();
    const base = templateCopy(f);
    const answer = JSON.stringify({
      ads: [{ id: "s0", hook: "Muddy shoes, clean conscience.", sub: "Unlock your potential with every step.", primary: "x".repeat(200), headline: "Better than Kettle & Crane Coffee", tiktok: "Trail runners, this is the coffee for the drive home. Juniper Roasters." }],
    });
    const r = mergeGlmCopy("```json\n" + answer + "\n```", [f]);
    expect(r.copy.s0.hook).toBe("Muddy shoes, clean conscience.");
    expect(r.copy.s0.tiktok).toMatch(/^Trail runners/);
    expect(r.copy.s0.sub).toBe(base.sub);
    expect(r.copy.s0.primary).toBe(base.primary);
    expect(r.copy.s0.headline).toBe(base.headline);
    expect(r.copy.s0.source).toBe("glm");
    expect(r.used).toBe(2);
    expect(r.rejected).toBe(3);
  });

  it("ignores malformed GLM output", () => {
    const r = mergeGlmCopy("sorry, I cannot", [facts()]);
    expect(r.used).toBe(0);
    expect(r.copy.s0.source).toBe("template");
  });
});

describe("segments", () => {
  it("skip generic Qloo tags and fix possessives", () => {
    expect(adWorthy("Media")).toBe(false);
    expect(adWorthy("female protagonist")).toBe(false);
    expect(adWorthy("Sustainable fashion advocates")).toBe(true);
    expect(possessive("Rothy's")).toBe("Rothy's");
    expect(possessive("Acme")).toBe("Acme's");
    expect(possessive("Outdoor Voices")).toBe("Outdoor Voices'");
    expect(peopleLike("Rothy's")).toBe("people like Rothy's customers");
  });

  it("carry Qloo cites and ranks, and copy never names the competitor", () => {
    const segs = buildSegments([SYNTHETIC_PACKAGE], "Juniper Roasters");
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) {
      expect(s.taste.cite).toMatch(/^q_/);
      expect(s.taste.rank).toBeGreaterThanOrEqual(1);
      expect(s.sub).not.toMatch(/'s's/);
      for (const v of [s.ad.hook, s.ad.sub, s.ad.primary, s.ad.headline, s.ad.tiktok]) expect(v.toLowerCase()).not.toContain("kettle & crane");
    }
  });
});

describe("brand kit", () => {
  it("reads theme colour and prefers the apple-touch icon, skipping .ico", () => {
    const html = `<head><meta name="theme-color" content="#0a7d4f"><link rel="icon" href="/favicon.ico"><link rel="icon" type="image/png" sizes="32x32" href="/f32.png"><link rel="apple-touch-icon" href="/apple.png"></head>`;
    const id = parseIdentity(html, "https://shop.example/");
    expect(id.themeColor).toBe("#0a7d4f");
    expect(id.icons[0]).toBe("https://shop.example/apple.png");
    expect(id.icons).not.toContain("https://shop.example/favicon.ico");
  });

  it("rejects white/black/grey accents and picks readable text", () => {
    expect(usableAccent("#ffffff")).toBe(false);
    expect(usableAccent("#000000")).toBe(false);
    expect(usableAccent("#808080")).toBe(false);
    expect(usableAccent("#0a7d4f")).toBe(true);
    expect(onColor("#0a7d4f")).toBe("#ffffff");
    expect(onColor("#f5d90a")).toBe("#111111");
    expect(contrast("#ffffff", "#111111")).toBeGreaterThan(15);
  });

  it("decodes an RGBA PNG and finds its dominant saturated colour", () => {
    const w = 16, h = 16;
    const raw = Buffer.alloc(h * (w * 4 + 1));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = y * (w * 4 + 1) + 1 + x * 4;
      const blue = x < 12;
      raw[o] = blue ? 0 : 255; raw[o + 1] = blue ? 164 : 255; raw[o + 2] = blue ? 228 : 255; raw[o + 3] = 255;
    }
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      return Buffer.concat([len, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
    expect(pngPixels(png)?.w).toBe(16);
    expect(dominantColor(png)).toBe("#00a4e4");
  });
});

describe("formats and layout", () => {
  it("formats have the platform sizes and safe zones", () => {
    expect(FORMATS.sq).toMatchObject({ w: 1080, h: 1080 });
    expect(FORMATS.pt).toMatchObject({ w: 1080, h: 1350 });
    expect(FORMATS.st).toMatchObject({ w: 1080, h: 1920 });
    expect(FORMATS.st.safe.bottom).toBeGreaterThanOrEqual(FORMATS.st.h * 0.25);
    expect(FORMATS.st.safe.top).toBeGreaterThanOrEqual(FORMATS.st.h * 0.14);
    expect(isFormat("st") && isVariant("editorial") && !isFormat("xx") && !isVariant("x")).toBe(true);
    expect(creativeUrl(3, 1, "pt", "bold", "abc", true)).toBe("/go/3/campaign/creative?s=1&f=pt&v=bold&c=abc&dl=1");
  });

  it("fitSize shrinks long hooks and keeps the longest word on one line", () => {
    const short = fitSize("Quietly sustainable.", 936, { max: 138, min: 76, lines: 3 });
    const long = fitSize("Environmental sustainability, done properly at last.", 936, { max: 138, min: 76, lines: 3 });
    expect(long).toBeLessThan(short);
    expect(fitSize("Supercalifragilisticexpialidocious", 936, { max: 200, min: 40, lines: 3 }) * 34 * 0.56).toBeLessThanOrEqual(936);
  });
});
