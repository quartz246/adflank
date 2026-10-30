"use client";

import { useState } from "react";
import type { Segment } from "@/lib/campaign/segments";
import { demoLabel } from "@/lib/campaign/segments";
import { possessive } from "@/lib/ads/copy";
import { creativeUrl, VARIANTS, VARIANT_LABEL, type CreativeFormat, type CreativeVariant } from "@/lib/ads/creative/formats";
import "./adwall.css";

/**
 * Step 6 ad wall: each ad category as finished creatives (server-rendered PNGs in the brand's own colours and icon)
 * inside faithful platform frames: Meta feed, Stories/Reels, TikTok and Google search. Copy comes from the campaign
 * copy endpoint (GLM after the banned-phrase filter, else the rule-based writer). Nothing here is published.
 */
export interface WallCopy { hook: string; sub: string; primary: string; headline: string; tiktok: string; source: string }
export interface WallKit { name: string; domain: string; accent: string; onAccent: string; icon: string | null; colorSource: string }
export interface WallGoogle { headlines: string[]; descriptions: string[]; path1: string; path2: string }
export interface CopyResponse { rev: string; source: string; pending?: boolean; copy: Record<string, WallCopy>; kit: WallKit; google: Record<string, WallGoogle> }

type Tab = "feed" | "story" | "tiktok" | "google";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "feed", label: "Meta feed" },
  { id: "story", label: "Stories" },
  { id: "tiktok", label: "TikTok" },
  { id: "google", label: "Google" },
];

export function BrandIcon({ kit, brand, size, round }: { kit: WallKit | null; brand: string; size: number; round?: boolean }) {
  const r = round ? "50%" : `${Math.round(size * 0.24)}px`;
  // eslint-disable-next-line @next/next/no-img-element
  if (kit?.icon) return <img className="aw-icon" src={kit.icon} alt="" width={size} height={size} style={{ borderRadius: r, width: size, height: size }} />;
  return <span className="aw-icon aw-word" aria-hidden style={{ width: size, height: size, borderRadius: r, background: kit?.accent ?? "#1d1d1f" }} />;
}

function Creative({ src, alt, ratio }: { src: string; alt: string; ratio: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`aw-creative${loaded ? " in" : ""}`} style={{ aspectRatio: ratio }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} onLoad={() => setLoaded(true)} decoding="async" />
    </div>
  );
}

const Heart = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.5 1.1 4.3 2.4.8-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21Z" /></svg>;
const Bubble = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3c5 0 9 3.4 9 7.7s-4 7.7-9 7.7c-1 0-2-.1-2.9-.4L4 20l1.3-3.9C3.9 14.7 3 12.8 3 10.7 3 6.4 7 3 12 3Z" /></svg>;
const Mark = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M6 3h12v18l-6-4.5L6 21V3Z" /></svg>;
const Share = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M13 4l8 7.5-8 7.5v-4.6c-5 0-8.3 1.4-10.5 4.6.8-5 3.6-9.4 10.5-10.3V4Z" /></svg>;
const Like = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M7 10v11H3V10h4Zm2 11V10l4.6-7.4c.9-.4 2.4.2 2.4 1.7V9h4.3c1.2 0 2 1.1 1.7 2.2l-2.3 8.2c-.2.9-1 1.6-2 1.6H9Z" /></svg>;
const Globe = () => <svg viewBox="0 0 16 16" aria-hidden className="aw-globe"><circle cx="8" cy="8" r="6.5" /><path d="M1.5 8h13M8 1.5c2 2.2 2 10.8 0 13M8 1.5c-2 2.2-2 10.8 0 13" /></svg>;

export function FeedFrame({ img, copy, kit, brand }: { img: string; copy: WallCopy; kit: WallKit | null; brand: string }) {
  const cut = copy.primary.length > 125;
  return (
    <figure className="aw-fb" aria-label="Meta feed ad preview">
      <header className="aw-fb-h">
        <BrandIcon kit={kit} brand={brand} size={40} round />
        <div className="aw-min"><b>{brand}</b><small>Sponsored · <Globe /></small></div>
        <span className="aw-dots" aria-hidden>···</span>
      </header>
      <p className="aw-fb-text">{cut ? `${copy.primary.slice(0, 122)}… ` : copy.primary}{cut && <span className="aw-more">See more</span>}</p>
      <Creative src={img} alt={`${brand} feed ad (4:5): ${copy.hook}`} ratio="4 / 5" />
      <div className="aw-fb-link">
        <div className="aw-min"><small>{(kit?.domain ?? "").toUpperCase()}</small><b>{copy.headline}</b></div>
        <span className="aw-fb-cta" style={ctaStyle(kit)}>Shop now</span>
      </div>
      <footer className="aw-fb-act"><span><Like />Like</span><span><Bubble />Comment</span><span><Share />Share</span></footer>
    </figure>
  );
}

export function StoryFrame({ img, copy, kit, brand }: { img: string; copy: WallCopy; kit: WallKit | null; brand: string }) {
  return (
    <figure className="aw-phone" aria-label="Instagram Stories ad preview">
      <Creative src={img} alt={`${brand} story ad (9:16): ${copy.hook}`} ratio="9 / 16" />
      <div className="aw-story-top">
        <div className="aw-bars"><i className="on" /><i /><i /></div>
        <div className="aw-story-id"><BrandIcon kit={kit} brand={brand} size={26} round /><b>{brand}</b><small>Sponsored</small></div>
      </div>
      <div className="aw-story-cta"><span className="aw-chev" aria-hidden /><span className="aw-pill" style={ctaStyle(kit)}>Shop now</span></div>
    </figure>
  );
}

export function TikTokFrame({ img, copy, kit, brand }: { img: string; copy: WallCopy; kit: WallKit | null; brand: string }) {
  const handle = (kit?.domain || brand).split(".")[0].toLowerCase().replace(/[^a-z0-9_]/g, "");
  return (
    <figure className="aw-phone aw-tt" aria-label="TikTok in-feed ad preview">
      <Creative src={img} alt={`${brand} TikTok ad (9:16): ${copy.hook}`} ratio="9 / 16" />
      <div className="aw-tt-top"><span>Following</span><b>For You</b></div>
      <div className="aw-tt-rail">
        <span className="aw-tt-av"><BrandIcon kit={kit} brand={brand} size={38} round /><i>+</i></span>
        <span><Heart /></span><span><Bubble /></span><span><Mark /></span><span><Share /></span>
      </div>
      <div className="aw-tt-cap">
        <b>{handle}</b>
        <p>{copy.tiktok}</p>
        <small>Sponsored</small>
        <span className="aw-tt-cta">Shop now <span aria-hidden>›</span></span>
      </div>
    </figure>
  );
}

export function GoogleFrame({ g, copy, kit, brand, query }: { g: WallGoogle | undefined; copy: WallCopy; kit: WallKit | null; brand: string; query: string }) {
  const hs = g?.headlines.length ? g.headlines : [brand, copy.headline];
  const ds = g?.descriptions.length ? g.descriptions : [copy.primary];
  const path = [kit?.domain, g?.path1, g?.path2].filter(Boolean).join(" › ");
  return (
    <figure className="aw-serp" aria-label="Google search ad preview">
      <div className="aw-serp-q"><svg viewBox="0 0 24 24" aria-hidden><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg><span>{query}</span></div>
      <div className="aw-serp-ad">
        <b className="aw-serp-sp">Sponsored</b>
        <div className="aw-serp-site"><BrandIcon kit={kit} brand={brand} size={26} round /><div className="aw-min"><span>{brand}</span><small>{path}</small></div></div>
        <h4>{hs.slice(0, 3).join(" | ")}</h4>
        <p>{ds.slice(0, 2).join(" ")}</p>
      </div>
      <div className="aw-serp-org" aria-hidden><i /><i /><i className="s" /></div>
      <figcaption>Responsive search ad: 3 of up to 15 headlines shown, as Google rotates them.</figcaption>
    </figure>
  );
}

const ord = (n: number) => `#${n}`;

/** The feed card's CTA in the brand colour; pale brand colours (which vanish on the light link strip) fall back to Meta blue. */
function ctaStyle(kit: WallKit | null): React.CSSProperties {
  const hex = kit?.accent && /^#[0-9a-f]{6}$/i.test(kit.accent) ? kit.accent : "";
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  // contrast against the #f0f2f5 strip must reach 3:1 for the button to read as a button
  if (!hex || (0.87 + 0.05) / (lum(hex) + 0.05) < 3) return { background: "#1877f2", color: "#fff" };
  return { background: hex, color: kit?.onAccent ?? "#fff" };
}

/** The Qloo facts behind one ad, each with the id of the Qloo call it came from. Ranks, not raw scores (Qloo's affinities are rank-scaled). */
export function whyRows(s: Segment): Array<{ k: string; text: string; cite?: string }> {
  const rows: Array<{ k: string; text: string; cite?: string }> = [];
  const t = s.taste;
  if (t.gap) rows.push({ k: "taste", text: `${t.label}: ${t.rank ? `${ord(t.rank)} of ${t.of} tastes` : "a taste"} their fans love${typeof t.yours === "number" && t.yours < 0.05 ? " and yours don't" : " more than yours"} (compare audiences).`, cite: t.cite });
  else rows.push({ k: "taste", text: `${t.label}: ${t.rank ? `${ord(t.rank)} of ${t.of}` : "one of"} their fans' defining tastes.`, cite: t.cite });
  if (!/^[A-Z]{2}$/.test(s.place.label)) rows.push({ k: "place", text: `${s.place.label}: ${s.place.rank ? `${ord(s.place.rank)} of ${s.place.of}` : "one of"} the places where they are most popular.`, cite: s.place.cite });
  if (s.demo.ageIndex > 0) rows.push({ k: "demo", text: `${demoLabel(s.demo)} over-index in this audience.`, cite: s.demo.cite });
  if (s.media) rows.push({ k: "media", text: `They ${s.media.kind === "podcast" ? "listen to" : "watch"} ${s.media.label}: a sponsorship slot for this ad.`, cite: s.media.cite });
  return rows;
}

/** The one-line reason under every ad card: the rival fans' taste and place, with the Qloo call it came from. */
export function qlooSays(s: Segment): { text: string; cite?: string } {
  const t = s.taste;
  const rank = t.rank ? ` (${ord(t.rank)} of ${t.of}${t.gap && typeof t.yours === "number" && t.yours < 0.05 ? ", and yours don't" : ""})` : "";
  const where = /^[A-Z]{2}$/.test(s.place.label) ? "" : `, and they are strongest in ${s.place.label}`;
  return { text: `${possessive(s.comp)} fans love ${t.label}${rank}${where}.`, cite: t.cite ?? s.place.cite };
}

/** How each Qloo fact became a real platform option (the targeting is the product; copy rides on it). */
export function targetingRows(s: Segment): Array<{ k: string; from: string; to: string; cite?: string }> {
  const rows: Array<{ k: string; from: string; to: string; cite?: string }> = [
    { k: "taste", from: `Fans of ${s.comp} love ${s.taste.label}`, to: `Meta + TikTok interest: ${s.taste.label} · Google custom segment: ${s.taste.label}`, cite: s.taste.cite },
    { k: "rival", from: `${s.comp} is the rival Qloo matched`, to: `Google keyword: "${s.comp.toLowerCase()} alternative"` },
  ];
  if (!/^[A-Z]{2}$/.test(s.place.label)) rows.push({ k: "place", from: `Strongest in ${s.place.label}${s.place.rank ? ` (${ord(s.place.rank)})` : ""}`, to: `Location: ${s.place.label}`, cite: s.place.cite });
  if (s.demo.ageIndex > 0) rows.push({ k: "demo", from: `${demoLabel(s.demo)} over-index`, to: `Age ${s.demo.band}${s.demo.gender === "everyone" ? "" : ` · ${s.demo.gender}`}`, cite: s.demo.cite });
  if (s.media) rows.push({ k: "media", from: `They ${s.media.kind === "podcast" ? "listen to" : "watch"} ${s.media.label}`, to: `Sponsorship: ${s.media.label}`, cite: s.media.cite });
  return rows;
}

export function QlooCite({ id }: { id?: string }) {
  if (!id) return null;
  return <a className="aw-cite" href={`/api/calls/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer" title="Open the Qloo call behind this">Qloo ↗</a>;
}

export default function AdWall({ projectId, seg, index, total, copyData, onPrev, onNext }: {
  projectId: number;
  seg: Segment;
  index: number;
  total: number;
  copyData: CopyResponse | null;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [tab, setTab] = useState<Tab>("feed");
  const [picked, setPicked] = useState<Record<number, CreativeVariant>>({});
  const variant = picked[index] ?? VARIANTS[index % VARIANTS.length];
  const copy: WallCopy = copyData?.copy[seg.id] ?? { ...seg.ad, source: "template" };
  const kit = copyData?.kit ?? null;
  const brand = kit?.name ?? "";
  const rev = copyData?.rev ?? "t";
  const fmt: CreativeFormat = tab === "feed" ? "pt" : "st";
  const img = creativeUrl(projectId, index, fmt, variant, rev);

  return (
    <div className="aw">
      <div className="aw-bar">
        <div className="aw-tabs" role="tablist" aria-label="Placement">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="aw-body">
        <div className="aw-col">
        <div className="aw-stage" key={`${seg.id}-${tab}`}>
          {tab === "feed" && <FeedFrame img={img} copy={copy} kit={kit} brand={brand} />}
          {tab === "story" && <StoryFrame img={img} copy={copy} kit={kit} brand={brand} />}
          {tab === "tiktok" && <TikTokFrame img={img} copy={copy} kit={kit} brand={brand} />}
          {tab === "google" && <GoogleFrame g={copyData?.google[seg.id]} copy={copy} kit={kit} brand={brand} query={`${brand} ${seg.taste.label}`.trim().toLowerCase()} />}
        </div>
        {(() => {
          const q = qlooSays(seg);
          return <p className="aw-qsays"><b>Why this ad: Qloo says</b> {q.text} <QlooCite id={q.cite} /></p>;
        })()}
        </div>

        <aside className="aw-side">
          <div className="aw-nav">
            <button type="button" onClick={onPrev} aria-label="Previous ad">‹</button>
            <span>Ad <b>{index + 1}</b> of {total}</span>
            <button type="button" onClick={onNext} aria-label="Next ad">›</button>
          </div>
          <p className="aw-hook">{copy.hook}</p>
          <p className="aw-for">{demoLabel(seg.demo)} · {seg.place.label} · people like {possessive(seg.comp)} customers</p>
          {tab !== "google" && (
            <div className="aw-vars" role="radiogroup" aria-label="Design">
              {VARIANTS.map((v) => (
                <button key={v} type="button" role="radio" aria-checked={variant === v} className={variant === v ? "on" : ""} onClick={() => setPicked((p) => ({ ...p, [index]: v }))}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={creativeUrl(projectId, index, "sq", v, rev)} alt="" loading="lazy" />
                  <span>{VARIANT_LABEL[v]}</span>
                </button>
              ))}
            </div>
          )}
          <div className="aw-why aw-tgt">
            <p className="aw-why-h">Targeting from Qloo</p>
            {targetingRows(seg).map((r) => (
              <p key={r.k} className="aw-tgt-r"><i className={`aw-k ${r.k}`} /><span><span className="from">{r.from}</span><span className="to">→ {r.to}</span></span><QlooCite id={r.cite} /></p>
            ))}
          </div>
          <div className="aw-why">
            <p className="aw-why-h">Every Qloo fact behind it</p>
            {whyRows(seg).map((w) => (
              <p key={w.k} className="aw-why-r"><i className={`aw-k ${w.k}`} /><span>{w.text}{w.cite && <code title="The Qloo call this fact came from">{w.cite}</code>}</span></p>
            ))}
          </div>
          {tab !== "google" && (
            <div className="aw-dl">
              <span>PNG</span>
              <a href={creativeUrl(projectId, index, "sq", variant, rev, true)} download>1:1</a>
              <a href={creativeUrl(projectId, index, "pt", variant, rev, true)} download>4:5</a>
              <a href={creativeUrl(projectId, index, "st", variant, rev, true)} download>9:16</a>
            </div>
          )}
          <p className="aw-fine">
            {copyData?.source === "glm" ? "Copy: AdFlank's copywriter agent (GLM)" : copyData?.pending ? "Copy: AdFlank's rule-based writer for now (the copywriter agent is still writing)" : "Copy: AdFlank's rule-based writer"}, checked against platform limits and a banned-phrase list.
            {kit ? (kit.colorSource === "default" ? ` ${kit.domain || "The site"} sets no brand colour, so the palette is neutral.` : ` Colours and icon from ${kit.domain}.`) : ""}
          </p>
        </aside>
      </div>
    </div>
  );
}
