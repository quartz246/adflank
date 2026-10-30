import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { inflateSync } from "node:zlib";

/**
 * The brand's own identity for the creatives, read from its homepage: theme colour, touch icon / favicon, and an accent
 * colour sampled from that icon. Server code only (no LLM tool reaches it). Same network rules as the site reader:
 * https only, public hosts only (every hop re-checked against private ranges), manual redirects, short timeouts and
 * byte caps. Anything that fails falls back to a neutral kit; no third-party logos, no stock art.
 */

export interface BrandKit {
  name: string;
  domain: string;
  /** Brand accent colour (#rrggbb). */
  accent: string;
  /** Readable text colour on the accent. */
  onAccent: string;
  /** PNG/JPEG/SVG data URI of the brand's own icon, if one could be read. */
  icon?: string;
  /** Where the colour came from (shown in the "why this ad" notes). */
  colorSource: "theme-color" | "icon" | "default";
}

const PAGE_BYTES = 350_000;
const ICON_BYTES = 200_000;
const TIMEOUT_MS = 5000;
const UA = "Mozilla/5.0 (compatible; AdFlankBot/1.0; +brand research)";

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
  if (isIP(host)) return false;
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateIp(a.address));
  } catch {
    return false;
  }
}

/** GET with every redirect hop re-checked; returns the body bytes (capped) and content type, or null. */
async function safeGet(url: string, cap: number, accept: string, fetcher: typeof fetch): Promise<{ bytes: Buffer; type: string; url: string } | null> {
  let cur = url;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try {
      u = new URL(cur);
    } catch {
      return null;
    }
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
    if (!(await publicHost(u.hostname))) return null;
    const res = await fetcher(u.toString(), { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": UA, accept } }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      cur = new URL(loc, u).toString().replace(/^http:/, "https:");
      continue;
    }
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < cap) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    void reader.cancel().catch(() => undefined);
    return { bytes: Buffer.concat(chunks).subarray(0, cap), type: (res.headers.get("content-type") ?? "").toLowerCase(), url: u.toString() };
  }
  return null;
}

/* ------------------------------------------------------------ colour helpers */

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string): number {
  const la = luminance(hexToRgb(a) ?? [0, 0, 0]);
  const lb = luminance(hexToRgb(b) ?? [0, 0, 0]);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export const INK = "#111111";
export const PAPER = "#f4f1ea";
export function onColor(bg: string): string {
  return contrast(bg, "#ffffff") >= contrast(bg, INK) ? "#ffffff" : INK;
}
function saturation([r, g, b]: [number, number, number]): number {
  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  return mx === 0 ? 0 : (mx - mn) / mx;
}
/** A brand colour is worth using when it is not near-white, near-black or grey. */
export function usableAccent(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const l = luminance(rgb);
  return l > 0.02 && l < 0.85 && saturation(rgb) > 0.25;
}

/** Deterministic accent for brands whose site gives no colour: a deep, quiet hue from the name (never neon). */
export function fallbackAccent(name: string): string {
  const palette = ["#1f3d2b", "#23395b", "#5b2333", "#3b2f5b", "#6b3e1f", "#1d4e4a", "#4a3b2a", "#2b2f3a"];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

/* ------------------------------------------------------------ minimal PNG decode (8-bit RGB/RGBA, non-interlaced) */

export function pngPixels(buf: Buffer): { w: number; h: number; ch: number; data: Buffer } | null {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let off = 8;
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const idat: Buffer[] = [];
  let plte: Buffer | null = null;
  let trns: Buffer | null = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const kind = buf.toString("ascii", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (kind === "IHDR") {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      interlace = body[12];
    } else if (kind === "IDAT") idat.push(body);
    else if (kind === "PLTE") plte = body;
    else if (kind === "tRNS") trns = body;
    else if (kind === "IEND") break;
    off += 12 + len;
  }
  const ch = type === 6 ? 4 : type === 2 ? 3 : type === 3 && plte ? 1 : 0;
  if (!ch || depth !== 8 || interlace || w * h > 600 * 600) return null;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = w * ch;
  if (raw.length < h * (stride + 1)) return null;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  if (type !== 3 || !plte) return { w, h, ch, data: out };
  // Palette image: expand indices to RGBA.
  const pal = plte as Buffer;
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const k = out[i];
    rgba[i * 4] = pal[k * 3] ?? 0;
    rgba[i * 4 + 1] = pal[k * 3 + 1] ?? 0;
    rgba[i * 4 + 2] = pal[k * 3 + 2] ?? 0;
    rgba[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255;
  }
  return { w, h, ch: 4, data: rgba };
}

/** Most common saturated colour of an icon (quantised buckets), or null when the icon is monochrome. */
export function dominantColor(png: Buffer): string | null {
  const px = pngPixels(png);
  if (!px) return null;
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  const step = Math.max(1, Math.floor((px.w * px.h) / 6000));
  for (let i = 0; i < px.w * px.h; i += step) {
    const o = i * px.ch;
    const r = px.data[o], g = px.data[o + 1], b = px.data[o + 2];
    if (px.ch === 4 && px.data[o + 3] < 200) continue;
    if (!usableAccent(rgbToHex(r, g, b))) continue;
    const k = `${r >> 5},${g >> 5},${b >> 5}`;
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(k, e);
  }
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  if (!best || best.n < 6) return null;
  return rgbToHex(best.r / best.n, best.g / best.n, best.b / best.n);
}

/* ------------------------------------------------------------ HTML parsing */

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
}

export function parseIdentity(html: string, base: string): { themeColor?: string; icons: string[] } {
  const head = html.slice(0, 200_000);
  let themeColor: string | undefined;
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const n = (attr(tag, "name") ?? attr(tag, "property") ?? "").toLowerCase();
    if (n === "theme-color" || n === "msapplication-tilecolor") {
      const c = attr(tag, "content")?.trim();
      if (c && hexToRgb(c) && !themeColor) themeColor = c.startsWith("#") ? c : `#${c}`;
    }
  }
  const icons: Array<{ href: string; score: number }> = [];
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !/icon/.test(rel) || /mask-icon/.test(rel)) continue;
    const size = Number((attr(tag, "sizes") ?? "").split("x")[0]) || 0;
    const type = (attr(tag, "type") ?? "").toLowerCase();
    if (/\.ico(\?|$)/i.test(href) || type.includes("x-icon")) continue;
    const score = (rel.includes("apple-touch") ? 400 : 0) + Math.min(size, 512) + (type.includes("png") || /\.png(\?|$)/i.test(href) ? 50 : 0);
    try {
      icons.push({ href: new URL(href.replace(/&amp;/g, "&"), base).toString(), score });
    } catch {
      /* skip */
    }
  }
  return { themeColor, icons: icons.sort((a, b) => b.score - a.score).map((i) => i.href).slice(0, 3) };
}

/* ------------------------------------------------------------ the kit */

const cache = new Map<string, { at: number; kit: Promise<BrandKit> }>();
const TTL_MS = 6 * 3600_000;

export function neutralKit(name: string, domain: string): BrandKit {
  const accent = fallbackAccent(name);
  return { name, domain, accent, onAccent: onColor(accent), colorSource: "default" };
}

export async function readBrandKit(name: string, siteUrl: string, fetcher: typeof fetch = fetch): Promise<BrandKit> {
  let domain = "";
  try {
    domain = new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return neutralKit(name, "");
  }
  const page = await safeGet(siteUrl, PAGE_BYTES, "text/html", fetcher);
  const ident = page ? parseIdentity(new TextDecoder().decode(page.bytes), page.url) : { icons: [] as string[] };
  let icon: string | undefined;
  let iconColor: string | null = null;
  for (const href of [...ident.icons, `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`]) {
    const got = await safeGet(href, ICON_BYTES, "image/png,image/svg+xml,image/jpeg", fetcher);
    if (!got || got.bytes.length < 100) continue;
    const isPng = got.bytes.readUInt32BE(0) === 0x89504e47;
    const isJpg = got.bytes[0] === 0xff && got.bytes[1] === 0xd8;
    const isSvg = !isPng && !isJpg && /svg/.test(got.type) && /<svg[\s>]/i.test(got.bytes.toString("utf8", 0, 2000)) && !/<script|on\w+\s*=|<foreignObject/i.test(got.bytes.toString("utf8"));
    if (!isPng && !isJpg && !isSvg) continue;
    // Google's service answers unknown domains with a generic 16 px globe; skip anything under 32 px.
    if (isPng && got.bytes.readUInt32BE(16) < 32) continue;
    icon = `data:${isPng ? "image/png" : isJpg ? "image/jpeg" : "image/svg+xml"};base64,${got.bytes.toString("base64")}`;
    if (isPng) iconColor = dominantColor(got.bytes);
    break;
  }
  const theme = ident.themeColor && usableAccent(ident.themeColor) ? ident.themeColor.toLowerCase() : undefined;
  const accent = theme ?? iconColor ?? fallbackAccent(name);
  return { name, domain, accent, onAccent: onColor(accent), icon, colorSource: theme ? "theme-color" : iconColor ? "icon" : "default" };
}

/** Cached per domain (6 h); concurrent image requests share one read. */
export function brandKit(name: string, siteUrl: string | null | undefined): Promise<BrandKit> {
  if (!siteUrl) return Promise.resolve(neutralKit(name, ""));
  const key = `${name}|${siteUrl}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.kit;
  const kit = readBrandKit(name, siteUrl).catch(() => neutralKit(name, ""));
  cache.set(key, { at: Date.now(), kit });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return kit;
}
