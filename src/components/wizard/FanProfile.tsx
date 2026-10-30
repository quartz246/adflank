"use client";

import { useEffect, useMemo, useState } from "react";
import type { AttackPackage } from "@/lib/types/attack";
import { buildSegments, demoLabel, estimateReach, fmtReach, type Segment } from "@/lib/campaign/segments";
import { creativeUrl, VARIANTS } from "@/lib/ads/creative/formats";
import type { HeatCell } from "@/lib/agent/wizard-view";
import { possessive } from "@/lib/ads/copy";
import { US_PATH, WORLD_PATH } from "@/lib/geo/outlines";
import { inLower48, projectUS, projectWorld, US_VIEW, WORLD_VIEW } from "@/lib/geo/project";

/**
 * Step 3 as one screen: the Qloo profile of a competitor's fans. Map of Qloo's heat cells, ranked metros, who they are,
 * what they love and the media they consume. Every block reads the stored Qloo calls (package + raw where_popular cells).
 */
export interface ProfileComp { name: string; done: boolean; pkg: AttackPackage; heat: HeatCell[] }

const BAND: Record<string, string> = { "18-24": "18–24", "25-34": "25–34", "35-44": "35–44", "45-54": "45–54", "55+": "55+" };
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n * 100))}`;
const cap = (x: string) => x.replace(/(^|[\s-])([a-z])/g, (_, b: string, c: string) => b + c.toUpperCase());
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export interface Metro { name: string; region?: string; cells: number; rank: number; lat?: number; lon?: number }

/** Heat cells grouped by their nearest metro, in Qloo's rank order; falls back to the package's place list. */
export function metrosOf(c: ProfileComp): Metro[] {
  const out: Metro[] = [];
  const by = new Map<string, Metro>();
  c.heat.forEach((h) => {
    if (!h.near) return;
    const m = by.get(h.near);
    if (m) m.cells++;
    else {
      const n: Metro = { name: h.near, region: h.region, cells: 1, rank: out.length + 1, lat: h.lat, lon: h.lon };
      by.set(h.near, n);
      out.push(n);
    }
  });
  if (out.length) return out;
  return c.pkg.where.filter((w) => w.city).map((w, i) => ({ name: w.city!, region: w.region, cells: 1, rank: i + 1 }));
}

function genderWord(p: AttackPackage): string {
  const d = (p.who.female ?? 0) - (p.who.male ?? 0);
  return d > 0.08 ? "women" : d < -0.08 ? "men" : "men and women";
}
function topBands(p: AttackPackage): string[] {
  const pos = [...p.who.ages].filter((a) => a.share > 0).sort((a, b) => b.share - a.share);
  return pos.slice(0, 2).map((a) => BAND[a.band] ?? a.band);
}
function tastes(p: AttackPackage): Array<{ label: string; note?: string; cite?: string }> {
  if (p.gap.length) return [...p.gap].sort((a, b) => b.delta - a.delta).map((g) => ({ label: cap(g.label), note: `+${Math.round(g.delta * 100)} vs yours`, cite: g.cite }));
  return p.interests.map((i) => ({ label: cap(i.name), cite: i.cite }));
}

/** One sentence that reads like a strategist's persona, every clause from a Qloo call. */
export function personaLine(c: ProfileComp): string {
  const p = c.pkg;
  const bits: string[] = [];
  const bands = topBands(p);
  if (p.who.ages.length) bits.push(`mostly ${genderWord(p)}${bands.length ? ` ${list(bands)}` : ""}`);
  const m = metrosOf(c).slice(0, 3).map((x) => x.name);
  if (m.length) bits.push(`strongest in ${list(m)}`);
  const t = tastes(p).slice(0, 3).map((x) => x.label);
  if (t.length) bits.push(`into ${list(t)}`);
  const pod = p.creators.find((x) => x.kind === "podcast");
  if (pod) bits.push(`listening to ${pod.name}`);
  const tv = p.creators.find((x) => x.kind === "tv_show");
  if (tv) bits.push(`watching ${tv.name}`);
  return bits.length ? `${bits.join(", ")}.` : "";
}

function Cite({ id, label = "Qloo ↗" }: { id?: string; label?: string }) {
  if (!id) return null;
  return <a className="fp-cite" href={`/api/calls/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer" title="Open the Qloo call behind this">{label}</a>;
}

export function FanMap({ c, country, active, ads, onPick }: { c: ProfileComp; country: string; active?: string | null; ads?: Map<string, number>; onPick?: (metro: string) => void }) {
  const metros = metrosOf(c);
  const cells = c.heat;
  const us = country === "US" || (cells.length > 0 && cells.every((h) => inLower48(h.lat, h.lon)));
  const pts = cells.length ? cells : [];
  let view = `0 0 ${US_VIEW.w} ${US_VIEW.h}`;
  let proj = (lat: number, lon: number) => projectUS(lat, lon);
  let scale = 1;
  if (!us) {
    proj = projectWorld;
    // Zoom the world outline to the cells' bounding box (at least 40° wide) so a country fills the frame.
    const xy = pts.map((h) => projectWorld(h.lat, h.lon));
    if (xy.length) {
      const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const w = Math.max(110, (Math.max(...xs) - Math.min(...xs)) * 1.6), h = w * 0.62;
      view = `${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
      scale = w / WORLD_VIEW.w;
    } else view = `0 0 ${WORLD_VIEW.w} ${WORLD_VIEW.h}`;
  }
  const shown = pts.filter((h) => !us || inLower48(h.lat, h.lon));
  const labelled = new Set<string>();
  // Label boxes already drawn (x0, y0, x1, y1), so a lower-ranked name never overlaps a higher-ranked one.
  const placed: Array<[number, number, number, number]> = [];
  const hits = (b: [number, number, number, number]) => placed.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
  const [vx, , vw] = view.split(" ").map(Number);
  return (
    <svg className="fp-map" viewBox={view} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Map of where ${possessive(c.name)} fans are strongest, from Qloo's heatmap`}>
      <path d={us ? US_PATH : WORLD_PATH} className="land" strokeWidth={us ? 1 : 0.6 * scale} />
      {shown.map((h, i) => {
        const [x, y] = proj(h.lat, h.lon);
        const r = (us ? 26 : 22) * scale * Math.max(0.5, 1 - i * 0.025);
        return (
          <g key={`${h.lat},${h.lon},${i}`} className="cell" style={{ animationDelay: `${120 + i * 70}ms` }}>
            <circle cx={x} cy={y} r={r * 1.9} className="halo" />
            <circle cx={x} cy={y} r={r * 0.42} className="core" />
          </g>
        );
      })}
      {metros.slice(0, 8).map((m) => {
        const h = shown.find((x) => x.near === m.name);
        if (!h || labelled.has(m.name)) return null;
        labelled.add(m.name);
        const [x, y] = proj(h.lat, h.lon);
        const fs = (us ? 22 : 20) * scale;
        const tw = m.name.length * fs * 0.56;
        const badge: [number, number, number, number] = [x - fs * 0.75, y - fs * 0.75, x + fs * 0.75, y + fs * 0.75];
        const rightBox: [number, number, number, number] = [x + fs * 0.8, y - fs * 0.6, x + fs * 1.1 + tw, y + fs * 0.6];
        const leftBox: [number, number, number, number] = [x - fs * 1.1 - tw, y - fs * 0.6, x - fs * 0.8, y + fs * 0.6];
        // Prefer the right side unless it runs off the map; drop the name (keep the badge) if both sides collide.
        const rightFits = rightBox[2] < vx + vw && !hits(rightBox);
        const leftFits = leftBox[0] > vx && !hits(leftBox);
        const left = !rightFits && leftFits;
        const named = rightFits || leftFits;
        placed.push(badge);
        if (named) placed.push(left ? leftBox : rightBox);
        return (
          <g key={m.name} className={`lbl${onPick ? " hit" : ""}${active === m.name ? " on" : ""}`} style={{ animationDelay: `${300 + m.rank * 90}ms` }} onClick={onPick ? () => onPick(m.name) : undefined} role={onPick ? "button" : undefined} aria-label={onPick ? `Ads in ${m.name}` : undefined}>
            {onPick && <circle cx={x} cy={y} r={fs * 1.6} className="tap" />}
            {(ads?.get(m.name) ?? 0) > 0 && <circle cx={x} cy={y} r={fs * 1.05} className="adring" />}
            <circle cx={x} cy={y} r={fs * 0.72} className="rk" />
            <text x={x} y={y + fs * 0.34} fontSize={fs * 0.9} textAnchor="middle" className="rkn">{m.rank}</text>
            {named && <text x={left ? x - fs * 1.0 : x + fs * 1.0} y={y + fs * 0.34} fontSize={fs} textAnchor={left ? "end" : "start"} className="nm">{m.name}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export default function FanProfile({ comps, ci, onPick, brand, country, designing, projectId, ready, onOpen }: { comps: ProfileComp[]; ci: number; onPick: (i: number) => void; brand: string; country: string; designing?: boolean; projectId: number; ready: boolean; onOpen: (seg: number) => void }) {
  const [spot, setSpot] = useState<string | null>(null);
  // Same segments, in the same order, as the campaign screen, so index n is campaign n + 1 there.
  const segs = useMemo(() => (ready ? buildSegments(comps.map((x) => x.pkg), brand) : []), [ready, comps, brand]);
  const ads = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of segs) m.set(s.place.label, (m.get(s.place.label) ?? 0) + 1);
    return m;
  }, [segs]);
  useEffect(() => setSpot(null), [ci]);
  const c = comps[Math.min(ci, comps.length - 1)];
  if (!c) return null;
  const p = c.pkg;
  const metros = metrosOf(c);
  const kinds = [
    { k: "podcast", t: "Podcasts they love" },
    { k: "tv_show", t: "TV they watch" },
    { k: "artist", t: "Artists they play" },
    { k: "brand", t: "Brands they also buy" },
  ] as const;
  const loves = tastes(p);
  const trend = p.trends.find((t) => t.entity === c.name || t.entity === p.competitor.name);
  const maxAbs = Math.max(0.2, ...p.who.ages.map((a) => Math.abs(a.share)));
  const persona = personaLine(c);
  return (
    <div className="fp">
      <div className="fp-top">
        {comps.length > 1 && (
          <div className="fp-tabs" role="tablist" aria-label="Competitor">
            {comps.map((x, i) => (
              <button key={x.name} type="button" role="tab" aria-selected={i === ci} className={i === ci ? "on" : ""} onClick={() => onPick(i)}>
                {possessive(x.name)} fans{!x.done && <i className="spin" />}
              </button>
            ))}
          </div>
        )}
        <p className="fp-persona"><span className="fp-q">Qloo says</span> people like <b>{possessive(c.name)}</b> customers are {persona || "still being profiled…"}</p>
      </div>

      <div className="fp-grid">
        <section className="fp-card fp-where">
          <header><b>Where their fans are</b><span>{c.heat.length ? `${c.heat.length} Qloo heat zones · ${metros.length} metros` : "Qloo heatmap"}</span><Cite id={c.heat[0]?.cite ?? p.where[0]?.cite} /></header>
          <div className="fp-where-in">
            <div className="fp-mapbox">
              {c.heat.length || p.where.length ? <FanMap c={c} country={country} active={spot} ads={ads} onPick={(m) => setSpot((x) => (x === m ? null : m))} /> : <div className="fp-wait"><i className="spin" />mapping where their fans are…</div>}
              {spot && <SpotCard east={eastOf(metros.find((m) => m.name === spot), c.heat)} metro={metros.find((m) => m.name === spot)} name={spot} segs={segs} ready={ready} projectId={projectId} comp={c.name} onOpen={onOpen} onClose={() => setSpot(null)} />}
              {!spot && metros.length > 0 && <p className="fp-hint">{ready ? "Click a city to see the ads aimed there" : "Click a city for its details"}</p>}
            </div>
            <ol className="fp-metros">
              {metros.slice(0, 12).map((m) => (
                <li key={m.name} style={{ animationDelay: `${200 + m.rank * 80}ms` }} className={spot === m.name ? "on" : ""}>
                  <button type="button" onClick={() => setSpot((x) => (x === m.name ? null : m.name))}>
                    <span className="rk">{m.rank}</span>
                    <span className="nm">{m.name}{m.region && !/^near /.test(m.region) ? <small> {m.region}</small> : null}</span>
                    {(ads.get(m.name) ?? 0) > 0 ? <span className="ad">{ads.get(m.name)} ad{ads.get(m.name) === 1 ? "" : "s"}</span> : m.cells > 1 ? <span className="z" title="Qloo heat zones around this metro">{m.cells} zones</span> : null}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="fp-card fp-who">
          <header><b>Who they are</b><span>vs the average adult</span><Cite id={p.who.cite} /></header>
          {p.who.ages.length ? (
            <>
              <div className="fp-ages">
                {p.who.ages.map((a) => (
                  <div key={a.band} className={`fp-age ${a.share > 0 ? "pos" : "neg"}`}>
                    <span className="lb">{BAND[a.band] ?? a.band}</span>
                    <span className="col"><i style={{ height: `${Math.max(3, (Math.abs(a.share) / maxAbs) * 48)}%` }} /></span>
                    <span className="v">{signed(a.share)}</span>
                  </div>
                ))}
              </div>
              <div className="fp-gender">
                <span>Men <b>{signed(p.who.male ?? 0)}</b></span>
                <span className="g"><i className="m" style={{ width: `${50 + Math.max(-45, Math.min(45, ((p.who.male ?? 0) - (p.who.female ?? 0)) * 100))}%` }} /></span>
                <span>Women <b>{signed(p.who.female ?? 0)}</b></span>
              </div>
            </>
          ) : <div className="fp-wait"><i className="spin" />reading their age and gender skew…</div>}
        </section>

        <section className="fp-card fp-love">
          <header><b>{p.gap.length ? `What they love that ${possessive(brand)} fans don't` : "What defines their taste"}</b><Cite id={loves[0]?.cite} /></header>
          {loves.length ? (
            <div className="fp-chips">
              {loves.slice(0, 12).map((t, i) => <span key={t.label} className={`fp-chip${i < 3 ? " hot" : ""}`} style={{ animationDelay: `${i * 45}ms` }}>{t.label}{t.note && <small>{t.note}</small>}</span>)}
            </div>
          ) : <div className="fp-wait"><i className="spin" />reading their taste tags…</div>}
        </section>

        <section className="fp-card fp-media">
          <header><b>What they listen to, watch and buy</b>{trend && (trend.points ?? 0) > 1 && <span className={`fp-trend ${trend.direction}`}>{c.name} {trend.direction === "flat" ? "steady" : trend.direction} on Qloo{trend.changePct ? ` (${trend.changePct > 0 ? "+" : ""}${Math.round(trend.changePct)}%)` : ""}</span>}</header>
          <div className="fp-media-in">
            {kinds.map(({ k, t }) => {
              const xs = p.creators.filter((x) => x.kind === k).slice(0, 4);
              return (
                <div key={k} className="fp-mcol">
                  <p>{t}<Cite id={xs[0]?.cite} label="↗" /></p>
                  {xs.length ? xs.map((x) => <span key={x.name} className="ell" title={x.name}>{x.name}</span>) : <span className="none">{c.done ? "none in Qloo" : "…"}</span>}
                </div>
              );
            })}
          </div>
        </section>
      </div>
      {designing && <p className="fp-next"><i className="spin" />The agents are turning this profile into a campaign for every segment…</p>}
    </div>
  );
}

/** The overlay for one city on the map: the campaigns aimed there (any competitor's fans), each opening in the campaign screen. */
/** Whether a metro sits in the right half of the map, so its overlay opens on the left and leaves the city visible. */
function eastOf(m: Metro | undefined, heat: HeatCell[]): boolean {
  if (m?.lon === undefined) return false;
  const lons = heat.map((h) => h.lon);
  const mid = lons.length ? (Math.min(...lons) + Math.max(...lons)) / 2 : -96;
  return m.lon > Math.min(mid, -96);
}

function SpotCard({ east, metro, name, segs, ready, projectId, comp, onOpen, onClose }: { east: boolean; metro?: Metro; name: string; segs: Segment[]; ready: boolean; projectId: number; comp: string; onOpen: (seg: number) => void; onClose: () => void }) {
  const here = segs.map((s, n) => ({ s, n })).filter(({ s }) => s.place.label === name);
  return (
    <div className={`fp-spot${east ? " west" : ""}`} role="dialog" aria-label={`Ads in ${name}`}>
      <header>
        <span className="rk">{metro?.rank ?? "·"}</span>
        <span className="ag-min">
          <b>{name}{metro?.region && !/^near /.test(metro.region) ? <small> {metro.region}</small> : null}</b>
          <small>#{metro?.rank ?? "?"} for {possessive(comp)} fans{metro && metro.cells > 1 ? ` · ${metro.cells} Qloo heat zones` : ""}</small>
        </span>
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </header>
      {!ready ? (
        <p className="fp-spot-note"><i className="spin" />The campaigns for {name} are being designed…</p>
      ) : here.length ? (
        <>
          <p className="fp-spot-h">{here.length} campaign{here.length === 1 ? "" : "s"} aimed at {name}</p>
          {here.map(({ s, n }) => (
            <button key={s.id} type="button" className="fp-spot-ad" onClick={() => onOpen(n)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={creativeUrl(projectId, n, "sq", VARIANTS[n % VARIANTS.length])} alt="" />
              <span className="ag-min">
                <small>#{n + 1} · {possessive(s.comp)} fans</small>
                <b>{s.taste.label} fans</b>
                <span>{demoLabel(s.demo)} · Meta, Stories, TikTok, Google · ~{fmtReach(estimateReach(s, [s.place]))}</span>
              </span>
              <span className="go">Open →</span>
            </button>
          ))}
        </>
      ) : (
        <p className="fp-spot-note">No campaign is aimed at {name} yet. The first campaigns go to each rival&apos;s strongest cities: {[...new Set(segs.map((s) => s.place.label))].join(", ")}.</p>
      )}
    </div>
  );
}
