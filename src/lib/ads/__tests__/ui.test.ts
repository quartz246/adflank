import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import AdsPanel from "@/components/ads/AdsPanel";
import ConnectPage from "@/app/(app)/connect/[platform]/page";
import { generateTemplates } from "@/lib/ads";
import { SYNTHETIC_PACKAGE as PKG } from "@/lib/ads/fixtures/synthetic";
import type { AdPlatform, AttackPackage } from "@/lib/types/attack";

const panel = (pkg: AttackPackage, platform: AdPlatform, publish = false, templates = generateTemplates(pkg)) =>
  renderToStaticMarkup(createElement(AdsPanel, { pkg, templates, initialPlatform: platform, initialPublishOpen: publish, connectFrom: "/projects/p1/ads" }));

describe("AdsPanel", () => {
  it("renders the three tabs, the people-like wording and the cite chips", () => {
    const html = panel(PKG, "meta");
    for (const l of ["Meta", "TikTok", "Google"]) expect(html).toContain(`>${l}`);
    expect(html).toContain("people like Kettle &amp; Crane Coffee&#x27;s customers");
    expect(html).toContain("q_synthetic_0001_4");
    expect(html).toContain("Download JSON");
    expect(html).toContain("Download CSV");
    expect(html).toContain('href="/connect/meta?from=%2Fprojects%2Fp1%2Fads"');
    expect(html).toContain("Connect Meta Ads");
  });
  it("TikTok is JSON only (no CSV button)", () => {
    const html = panel(PKG, "tiktok");
    expect(html).not.toContain("Download CSV");
    expect(html).toContain("Creative brief");
    expect(html).toContain("Connect TikTok Ads");
  });
  it("Google shows the SERP mockup and every headline with its count", () => {
    const html = panel(PKG, "google");
    expect(html).toContain("Sponsored");
    expect(html).toMatch(/Headlines \(\d+\/15\)/);
    expect(html).toContain("/30");
    expect(html).toContain("Audience segment");
  });
  it("Publish is a labelled stub that shows the payload", () => {
    const html = panel(PKG, "google", true);
    expect(html).toContain("Publishing launches after the hackathon");
    expect(html).toContain("Nothing was sent");
    expect(html).toContain("responsive_search_ad");
  });
  it("disables the CSV download when a template has errors", () => {
    const ts = generateTemplates(PKG);
    ts[0] = { ...ts[0], csv: undefined, issues: [...ts[0].issues, { field: "x", message: "boom", severity: "error" }] };
    const html = panel(PKG, "meta", false, ts);
    expect(html).toContain("CSV blocked until the errors are fixed");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Download CSV/);
  });
  it("escapes hostile names and copy", () => {
    const evil: AttackPackage = { ...PKG, competitor: { name: '<script>alert("x")</script>' }, brand: { name: "<img src=x onerror=alert(1)>" } };
    const html = panel(evil, "meta", true);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("connect page", () => {
  const render = async (platform: string, from?: string) =>
    renderToStaticMarkup(await ConnectPage({ params: Promise.resolve({ platform }), searchParams: Promise.resolve(from ? { from } : {}) }));
  it("lists the real scopes and is labelled as a preview", async () => {
    const meta = await render("meta");
    for (const s of ["ads_management", "ads_read", "business_management"]) expect(meta).toContain(s);
    expect(meta).toContain("Preview of the connection being implemented");
    expect(await render("google")).toContain("https://www.googleapis.com/auth/adwords");
    expect(await render("tiktok")).toContain("Ads Management");
  });
  it("rejects unknown platforms and open redirects", async () => {
    expect(await render("myspace")).toContain("Unknown ad platform");
    expect(await render("meta", "//evil.example/x")).toContain('href="/projects"');
    expect(await render("meta", "/projects/p1/ads")).toContain('href="/projects/p1/ads"');
  });
});

describe("source hygiene", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  const root = join(__dirname, "..", "..", "..");
  const src = [...files(join(root, "lib", "ads")), ...files(join(root, "components", "ads")), ...files(join(root, "app", "(app)", "connect"))]
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__"));
  it("never uses dangerouslySetInnerHTML, fetch or env", () => {
    expect(src.length).toBeGreaterThan(10);
    for (const f of src) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/dangerouslySetInnerHTML|\bfetch\(|process\.env|XMLHttpRequest|sendBeacon/);
    }
  });
});
