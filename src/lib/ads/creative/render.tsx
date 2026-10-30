import * as React from "react";
import type { BrandKit } from "./brand";
import { INK, PAPER } from "./brand";
import { FORMATS, type CreativeFormat, type CreativeVariant } from "./formats";

/**
 * The creatives as satori JSX (next/og renders them to PNG on the server). Typographic, brand-coloured, no stock art,
 * no people, no other brands' logos. 9:16 creatives carry no button: Stories/Reels/TikTok draw their own CTA there.
 * Satori rule: every element with more than one child is display:flex.
 */
export interface CreativeData {
  kit: BrandKit;
  hook: string;
  sub: string;
  cta: string;
  /** Qloo taste (shown as the kicker / the big word). */
  taste: string;
  /** Qloo place (a city, or "" when Qloo gave only a country). */
  place: string;
}

export const FONT_FILES = [
  { file: "Geist-Regular.ttf", name: "Geist", weight: 400 as const },
  { file: "Geist-SemiBold.ttf", name: "Geist", weight: 600 as const },
  { file: "Geist-Black.ttf", name: "Geist", weight: 900 as const },
  { file: "NotoSerifDisplay-Bold.ttf", name: "Serif", weight: 700 as const },
];

/** Font size that keeps a line count sensible for the box width (characters per line ~ width / (size * k)). */
export function fitSize(text: string, width: number, opts: { max: number; min: number; lines: number; k?: number }): number {
  const k = opts.k ?? 0.56;
  const len = Math.max(1, [...text].length);
  const longest = Math.max(...text.split(/\s+/).map((w) => [...w].length), 1);
  // Size so the text fits in `lines` lines and the longest word fits on one line.
  const byLines = (width * opts.lines) / (len * k * 1.08);
  const byWord = width / (longest * k * 1.02);
  return Math.round(Math.max(opts.min, Math.min(opts.max, byLines, byWord)));
}

function Lockup({ kit, color, size }: { kit: BrandKit; color: string; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {kit.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={kit.icon} width={size} height={size} style={{ width: size, height: size, borderRadius: size * 0.22, marginRight: size * 0.32, objectFit: "cover" }} alt="" />
      ) : null}
      <span style={{ fontFamily: "Geist", fontWeight: 600, fontSize: size * 0.6, color, letterSpacing: "-0.01em" }}>{kit.name}</span>
    </div>
  );
}

function Cta({ label, bg, fg, size }: { label: string; bg: string; fg: string; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", background: bg, color: fg, borderRadius: 999, padding: `${size * 0.5}px ${size * 1.05}px`, fontFamily: "Geist", fontWeight: 600, fontSize: size }}>
      <span>{label}</span>
      <span style={{ marginLeft: size * 0.45 }}>→</span>
    </div>
  );
}

const upper = (s: string) => s.toUpperCase();
const kickerOf = (d: CreativeData) => (d.place ? `${upper(d.taste)} · ${upper(d.place)}` : upper(d.taste));

export function Creative({ d, fmt, v }: { d: CreativeData; fmt: CreativeFormat; v: CreativeVariant }) {
  const F = FORMATS[fmt];
  const { safe } = F;
  const innerW = F.w - safe.left - safe.right;
  const tall = fmt === "st";
  const base: React.CSSProperties = { width: F.w, height: F.h, display: "flex", flexDirection: "column", position: "relative", paddingTop: safe.top, paddingRight: safe.right, paddingBottom: safe.bottom, paddingLeft: safe.left };
  const lock = tall ? 64 : 60;
  const ctaSize = tall ? 40 : 36;

  if (v === "bold") {
    const size = fitSize(d.hook, innerW, { max: tall ? 172 : 138, min: 76, lines: tall ? 5 : 3, k: 0.55 });
    return (
      <div style={{ ...base, background: d.kit.accent, color: d.kit.onAccent }}>
        <Lockup kit={d.kit} color={d.kit.onAccent} size={lock} />
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontFamily: "Geist", fontWeight: 900, fontSize: size, lineHeight: 0.98, letterSpacing: "-0.035em" }}>{d.hook}</div>
          <div style={{ display: "flex", marginTop: size * 0.42, fontFamily: "Geist", fontWeight: 400, fontSize: tall ? 42 : 38, lineHeight: 1.3, opacity: 0.86, maxWidth: innerW * 0.92 }}>{d.sub}</div>
        </div>
        {tall ? null : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Cta label={d.cta} bg={d.kit.onAccent} fg={d.kit.accent} size={ctaSize} />
            <span style={{ fontFamily: "Geist", fontWeight: 600, fontSize: 30, opacity: 0.75 }}>{d.kit.domain}</span>
          </div>
        )}
      </div>
    );
  }

  if (v === "editorial") {
    const size = fitSize(d.hook, innerW, { max: tall ? 160 : 124, min: 72, lines: tall ? 5 : 3, k: 0.5 });
    return (
      <div style={{ ...base, background: PAPER, color: INK }}>
        {tall ? <div style={{ display: "flex", marginBottom: 40 }}><Lockup kit={d.kit} color={INK} size={lock} /></div> : null}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 56, height: 6, background: d.kit.accent, marginRight: 22 }} />
          <span style={{ fontFamily: "Geist", fontWeight: 600, fontSize: 28, letterSpacing: "0.16em", color: INK, opacity: 0.8 }}>{kickerOf(d)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontFamily: "Serif", fontWeight: 700, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.02em" }}>{d.hook}</div>
          <div style={{ display: "flex", marginTop: size * 0.4, fontFamily: "Geist", fontWeight: 400, fontSize: tall ? 40 : 36, lineHeight: 1.35, color: "#3a3a3a", maxWidth: innerW * 0.9 }}>{d.sub}</div>
        </div>
        {tall ? null : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ height: 2, background: INK, opacity: 0.85, marginBottom: 36 }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Lockup kit={d.kit} color={INK} size={lock} />
              <Cta label={d.cta} bg={d.kit.accent} fg={d.kit.onAccent} size={ctaSize} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // "type": the Qloo taste as a huge word in the brand colour on ink, the hook beneath.
  const word = d.taste.replace(/\s+/g, " ").trim();
  const accentOnInk = contrastOk(d.kit.accent) ? d.kit.accent : "#f4f1ea";
  const wordSize = fitSize(word, innerW, { max: tall ? 250 : 220, min: 90, lines: word.length > 14 ? 2 : 1, k: 0.6 });
  const hookSize = fitSize(d.hook, innerW, { max: tall ? 84 : 66, min: 44, lines: tall ? 3 : 2, k: 0.52 });
  return (
    <div style={{ ...base, background: "#0e0e0e", color: "#f4f1ea" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Lockup kit={d.kit} color="#f4f1ea" size={lock} />
        {d.place ? <span style={{ fontFamily: "Geist", fontWeight: 600, fontSize: 28, letterSpacing: "0.16em", opacity: 0.6 }}>{upper(d.place)}</span> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
        <div style={{ display: "flex", fontFamily: "Geist", fontWeight: 900, fontSize: wordSize, lineHeight: 0.9, letterSpacing: "-0.045em", color: accentOnInk }}>{word}</div>
        <div style={{ display: "flex", marginTop: 44, fontFamily: "Geist", fontWeight: 600, fontSize: hookSize, lineHeight: 1.12, letterSpacing: "-0.02em" }}>{d.hook}</div>
        {tall ? <div style={{ display: "flex", marginTop: 28, fontFamily: "Geist", fontWeight: 400, fontSize: 38, lineHeight: 1.3, opacity: 0.7 }}>{d.sub}</div> : null}
      </div>
      {tall ? null : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "Geist", fontWeight: 400, fontSize: 30, opacity: 0.7, maxWidth: innerW * 0.55 }}>{d.sub}</span>
          <Cta label={d.cta} bg="#f4f1ea" fg="#0e0e0e" size={ctaSize} />
        </div>
      )}
    </div>
  );
}

/** The accent reads on near-black ink (contrast >= 3, the WCAG large-text threshold). */
function contrastOk(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const lum = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lum(parseInt(m[1], 16)) + 0.7152 * lum(parseInt(m[2], 16)) + 0.0722 * lum(parseInt(m[3], 16));
  return (l + 0.05) / (0.0056 + 0.05) >= 3;
}
