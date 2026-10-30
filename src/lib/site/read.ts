import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { cleanLandingUrl } from "@/lib/util/url";
import { clip } from "@/lib/util/sanitize";

/**
 * Step 1 of the website flow: read the brand's homepage. Server code only (no LLM tool can fetch).
 * Public https hosts only, every redirect hop re-checked, DNS answers checked against private ranges,
 * 6 s and 400 KB caps. The page text is treated as data and clipped before any prompt sees it.
 */
export interface SiteInfo {
  url: string;
  domain: string;
  name: string;
  title: string;
  description: string;
  ok: boolean;
  note?: string;
}

const MAX_BYTES = 400_000;
const CHALLENGE = /just a moment|attention required|access denied|forbidden|captcha|are you a robot|security check|^\s*\d{3}\b/i;
const TIMEOUT_MS = 6000;

/** "allbirds.com", "https://www.allbirds.com/x" -> canonical https URL, or null when not a public host. */
export function normaliseSite(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw || raw.length > 300) return null;
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : `https://${raw}`;
  const u = cleanLandingUrl(withScheme);
  if (!u) return null;
  const url = new URL(u);
  return `https://${url.hostname.toLowerCase()}/`;
}

export function domainOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
    return v === "::1" || v === "::" || /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function publicHost(host: string): Promise<boolean> {
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateIp(a.address));
  } catch {
    return false;
  }
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, " ").trim();

function meta(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content) : "";
}

/** Brand name: og:site_name, else the title segment that matches the domain, else the domain stem. */
export function brandName(domain: string, title: string, siteName: string): string {
  const stem = domain.split(".")[0];
  const pretty = stem.charAt(0).toUpperCase() + stem.slice(1);
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (siteName && siteName.length <= 40) return siteName;
  const parts = title.split(/\s[|\-–—:·•]\s|\s[|–—·•]|[|–—·•]\s/).map((p) => p.trim()).filter(Boolean);
  const hit = parts.find((p) => squash(p) === squash(stem)) ?? parts.find((p) => p.length <= 30 && squash(p).includes(squash(stem)));
  return clip(hit ?? pretty, 60);
}

export async function readSite(url: string, fetcher: typeof fetch = fetch): Promise<SiteInfo> {
  const domain = domainOf(url);
  const fallback = (note: string): SiteInfo => ({ url, domain, name: brandName(domain, "", ""), title: "", description: "", ok: false, note });
  let cur = url;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const host = new URL(cur).hostname;
      if (!(await publicHost(host))) return fallback("the site's address is not a public host");
      const res = await fetcher(cur, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "Mozilla/5.0 (compatible; PoachlyBot/1.0; +brand research)", accept: "text/html" },
      });
      if (res.status >= 300 && res.status < 400) {
        const next = cleanLandingUrl(new URL(res.headers.get("location") ?? "", cur).toString().replace(/^http:/, "https:"));
        if (!next) return fallback("the site redirected somewhere we do not follow");
        cur = next;
        continue;
      }
      // Many shops answer bots with 403/429 but still send their title; challenge pages are ignored below.
      const blocked = [401, 403, 429, 503].includes(res.status);
      if ((!res.ok && !blocked) || !res.body) return fallback(`the site answered ${res.status}`);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      void reader.cancel().catch(() => undefined);
      const html = new TextDecoder().decode(Buffer.concat(chunks)).slice(0, MAX_BYTES);
      let title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
      let siteName = meta(html, "og:site_name");
      let description = meta(html, "description") || meta(html, "og:description");
      if (CHALLENGE.test(title)) title = siteName = description = "";
      if (blocked && !title) return fallback("the site blocks automated visits");
      return { url, domain, name: brandName(domain, title || meta(html, "og:title"), siteName), title: clip(title, 140), description: clip(description === title ? "" : description, 240), ok: true, ...(blocked ? { note: "the site limits automated visits; read its title only" } : {}) };
    }
    return fallback("too many redirects");
  } catch {
    return fallback("the site did not answer in time");
  }
}
