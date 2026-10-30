"use client";

import { useEffect, useMemo, useState } from "react";
import type { AttackPackage } from "@/lib/types/attack";
import { adWorthy, buildSegments, demoLabel, estimateReach, fmtReach, REACH_NOTE } from "@/lib/campaign/segments";
import { possessive } from "@/lib/ads/copy";
import { creativeUrl, VARIANTS } from "@/lib/ads/creative/formats";

/**
 * Campaign manager, proof of concept. The ad categories become ad sets; the Qloo levers change each set's targeting
 * from the stored Qloo scores (related tastes above a match threshold, the strongest places, over-indexed age bands).
 * Settings live in this browser only. Launch is a preview: Poachly does not publish to ad platforms.
 */
type Platform = "meta" | "tiktok" | "youtube";
interface Levers { match: number; places: number; ages: string[]; platforms: Platform[]; budget: number; split: "even" | "qloo"; off: string[] }
const PLAT: Record<Platform, string> = { meta: "Meta", tiktok: "TikTok", youtube: "YouTube" };
const BANDS = ["18-24", "25-34", "35-44", "45-54", "55+"];

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function CampaignManager({ projectId, brand, pkgs, guest }: { projectId: number; brand: string; pkgs: AttackPackage[]; guest: boolean }) {
  const segs = useMemo(() => buildSegments(pkgs, brand), [pkgs, brand]);
  const key = `adflank-campaign-${projectId}`;
  const initial: Levers = { match: 0.6, places: 2, ages: [...new Set(segs.map((s) => s.demo.band))], platforms: ["meta", "tiktok", "youtube"], budget: 150, split: "qloo", off: [] };
  const [L, setL] = useState<Levers>(initial);
  const [launched, setLaunched] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) setL({ ...initial, ...(JSON.parse(saved) as Partial<Levers>) });
    } catch {
      /* private mode: defaults */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(L));
    } catch {
      /* ignore */
    }
  }, [key, L]);
  const set = (p: Partial<Levers>) => setL((x) => ({ ...x, ...p }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const sets = segs.map((s) => {
    const tastes = [s.taste.label, ...s.related.filter((t) => t.score >= L.match && adWorthy(t.label)).slice(0, 4).map((t) => t.label)];
    const places = s.places.slice(0, L.places);
    const active = !L.off.includes(s.id) && L.ages.includes(s.demo.band) && L.platforms.length > 0;
    const weight = s.taste.score * (s.place.score || 1) + 0.05;
    const reach = estimateReach({ demo: s.demo, taste: { ...s.taste, score: Math.min(1, s.taste.score + (tastes.length - 1) * 0.08) } }, places);
    return { s, tastes, places, active, weight, reach };
  });
  const live = sets.filter((x) => x.active);
  const totalW = live.reduce((a, x) => a + x.weight, 0) || 1;
  const budgetOf = (x: (typeof sets)[number]) => (!x.active ? 0 : L.split === "even" ? L.budget / live.length : (L.budget * x.weight) / totalW);
  const comps = [...new Set(segs.map((s) => s.comp))];
  const allBands = [...new Set([...segs.map((s) => s.demo.band), ...BANDS])].filter((b) => BANDS.includes(b));

  const exportCsv = () => {
    const head = ["ad_set", "status", "audience", "target_fans_of", "locations", "interests", "age_band", "gender", "platforms", "daily_budget_usd", "est_reach", "meta_primary_text", "youtube_title"];
    const rows = sets.map((x) => [x.s.name, x.active ? "ready" : "off", x.s.sub, x.s.comp, x.places.map((p) => p.label).join("; "), x.tastes.join("; "), x.s.demo.band, x.s.demo.gender, L.platforms.map((p) => PLAT[p]).join("; "), budgetOf(x).toFixed(2), x.reach, x.s.ad.primary, x.s.ad.youtube.title]);
    download(`adflank_campaign_${brand.replace(/\W+/g, "-")}.csv`, [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n"));
  };

  return (
    <div className="wz cm">
      <header className="wz-top">
        <div className="cm-crumbs">
          <a href="/" className="wz-logo"><span className="wz-mark">P</span></a>
          <a className="crumb" href={`/go/${projectId}`}>← Ad categories</a>
          <b className="ell">{brand} campaign</b>
          <span className={`wz-chip ${launched ? "ok" : ""}`}>{launched ? <><i className="dot" />ready · preview</> : "draft"}</span>
        </div>
        <div className="wz-top-r">
          {guest && <a className="wz-btn ghost sm" href={`/signup?claim=${projectId}`}>Save it free</a>}
          <button type="button" className="wz-btn ghost sm" onClick={exportCsv}>Export</button>
          <button type="button" className="wz-btn sm" disabled={!live.length} onClick={() => setLaunched(true)}>{launched ? "Launched (preview)" : "Launch campaign"}</button>
        </div>
      </header>

      <div className="cm-body">
        <aside className="cm-levers">
          <p className="cm-h">Qloo levers</p>

          <div className="cm-lever">
            <div className="cm-row"><span>Taste match</span><b>{L.match >= 0.75 ? "Strict" : L.match >= 0.45 ? "Balanced" : "Broad"}</b></div>
            <input type="range" min={0.2} max={0.9} step={0.05} value={1.1 - L.match} onChange={(e) => set({ match: Math.round((1.1 - Number(e.target.value)) * 100) / 100 })} aria-label="Taste match" />
            <small>Adds related tastes these fans score {Math.round(L.match * 100)}+ on in Qloo.</small>
          </div>

          <div className="cm-lever">
            <div className="cm-row"><span>Places per ad set</span><b>{L.places}</b></div>
            <input type="range" min={1} max={5} step={1} value={L.places} onChange={(e) => set({ places: Number(e.target.value) })} aria-label="Places per ad set" />
            <small>Strongest places first, by Qloo affinity.</small>
          </div>

          <div className="cm-lever">
            <div className="cm-row"><span>Age focus</span></div>
            <div className="cm-chips">
              {allBands.map((b) => (
                <button key={b} type="button" className={`cm-chip ${L.ages.includes(b) ? "on" : ""}`} onClick={() => set({ ages: toggle(L.ages, b) })}>
                  {b}{segs.some((s) => s.demo.band === b) && <i title="Over-indexed in Qloo" />}
                </button>
              ))}
            </div>
            <small>Dotted bands over-index among these fans.</small>
          </div>

          <div className="cm-lever">
            <div className="cm-row"><span>Platforms</span></div>
            <div className="cm-chips">
              {(Object.keys(PLAT) as Platform[]).map((p) => (
                <button key={p} type="button" className={`cm-chip ${L.platforms.includes(p) ? "on" : ""}`} onClick={() => set({ platforms: toggle(L.platforms, p) })}>{PLAT[p]}</button>
              ))}
            </div>
          </div>

          <div className="cm-lever">
            <div className="cm-row"><span>Daily budget</span><b>${L.budget}</b></div>
            <input type="range" min={20} max={2000} step={10} value={L.budget} onChange={(e) => set({ budget: Number(e.target.value) })} aria-label="Daily budget" />
            <div className="cm-seg">
              <button type="button" className={L.split === "qloo" ? "on" : ""} onClick={() => set({ split: "qloo" })}>Weight by Qloo affinity</button>
              <button type="button" className={L.split === "even" ? "on" : ""} onClick={() => set({ split: "even" })}>Split evenly</button>
            </div>
          </div>
        </aside>

        <main className="cm-main">
          {launched && <div className="cm-note">Preview mode: the campaign is ready, but Poachly does not publish to ad platforms yet. Export it, or connect Meta, TikTok and Google Ads when publishing opens.</div>}
          <div className="cm-sum">
            <div><b>{live.length}</b><span>of {sets.length} ad sets on</span></div>
            <div><b>${L.budget}</b><span>per day</span></div>
            <div><b>{new Set(live.flatMap((x) => x.places.map((p) => p.label))).size}</b><span>places</span></div>
            <div><b>{new Set(live.flatMap((x) => x.tastes)).size}</b><span>tastes</span></div>
            <div title={REACH_NOTE}><b>~{fmtReach(live.reduce((n, x) => n + x.reach, 0))}</b><span>est. reach (Poachly model)</span></div>
          </div>

          <div className="cm-sets">
            {sets.map((x, n) => (
              <div key={x.s.id} className={`cm-set ${x.active ? "" : "off"}`}>
                <span className="cm-av">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={creativeUrl(projectId, n, "sq", VARIANTS[n % VARIANTS.length])} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "inherit" }} /></span>
                <div className="cm-main-col">
                  <div className="cm-title"><b>{x.s.name}</b><span><i className={`st-dot k${x.s.compIndex % 4}`} />people like {possessive(x.s.comp)} customers</span></div>
                  <div className="cm-tags">
                    {x.places.map((p) => <span key={p.label} className="t place">{p.label}</span>)}
                    {x.tastes.map((t) => <span key={t} className="t taste">{t}</span>)}
                    <span className="t demo">{demoLabel(x.s.demo)}</span>
                    {x.s.media && <span className="t media">{x.s.media.label}</span>}
                  </div>
                </div>
                <div className="cm-right">
                  <b>${budgetOf(x).toFixed(0)}<small>/day</small></b>
                  <span className="cm-reach" title={REACH_NOTE}>~{fmtReach(x.reach)} est. reach</span>
                  <span className="cm-plats">{L.platforms.map((p) => PLAT[p]).join(" · ") || "no platform"}</span>
                </div>
                <button type="button" role="switch" aria-checked={!L.off.includes(x.s.id)} className={`cm-switch ${L.off.includes(x.s.id) ? "" : "on"}`} onClick={() => set({ off: toggle(L.off, x.s.id) })} aria-label={`Turn ${x.s.name} on or off`}><i /></button>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
