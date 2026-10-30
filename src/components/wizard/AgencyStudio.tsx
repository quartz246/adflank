"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AttackPackage } from "@/lib/types/attack";
import { BUDGET_NOTE, buildSegments, demoLabel, fmtReach, POOL_SEGMENTS } from "@/lib/campaign/segments";
import { BANDS, budgetAt, MATCH, PLAT_LABEL, planCampaigns, restoreSettings, runsFor, SLIDER, type CampaignSettings, type Platform } from "@/lib/campaign/plan";
import { api } from "@/components/core/api";
import { cityCoords } from "@/lib/geo/cities";
import type { HeatCell } from "@/lib/agent/wizard-view";
import { possessive } from "@/lib/ads/copy";
import { creativeUrl, VARIANTS, VARIANT_LABEL, type CreativeVariant } from "@/lib/ads/creative/formats";
import { FeedFrame, GoogleFrame, QlooCite, StoryFrame, TikTokFrame, type WallCopy } from "@/components/ads/AdWall";
import "@/components/ads/adwall.css";
import { useCampaignCopy } from "./useCampaignCopy";
import CampaignMap, { type Pin } from "./CampaignMap";

/**
 * Step 6 as one screen: the agency's campaigns, one per audience segment of the competitors' fans (a taste, a place and
 * an age/gender band, each from a Qloo call). The stage is a map of the campaigns' cities with the selected campaign's ad
 * floating over it; a daily budget drives the (estimated) weekly reach. Nothing is published or spent here.
 */
/** Scales its child down (never up) so a platform frame always fits the stage without scrolling. */
function FitBox({ children, k }: { children: React.ReactNode; k: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(1);
  useLayoutEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      const w = i.offsetWidth, h = i.offsetHeight;
      if (!w || !h) return;
      setS(Math.min(1, (o.clientWidth - 8) / w, (o.clientHeight - 8) / h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [k]);
  return (
    <div className="ag-fit" ref={outer}>
      <div className="ag-fit-in" ref={inner} style={{ transform: `scale(${s})` }}>{children}</div>
    </div>
  );
}

type Tab = "feed" | "story" | "tiktok" | "google";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "feed", label: "Meta feed" },
  { id: "story", label: "Stories" },
  { id: "tiktok", label: "TikTok" },
  { id: "google", label: "Google" },
];

const TAB_PLATFORM: Record<Tab, Platform> = { feed: "meta", story: "meta", tiktok: "tiktok", google: "google" };

export default function AgencyStudio({ pkgs, brand, domain, start, focus, heat, scheduled, settings }: { pkgs: AttackPackage[]; brand: string; domain: string; start: string; focus?: { n: number; at: number } | null; heat: HeatCell[]; scheduled?: boolean; settings?: unknown }) {
  const projectId = Number(start.match(/\/go\/(\d+)/)?.[1] ?? 0);
  // The pool the agency draws from; campaign n on screen shows pool segment active[n] (its images use the pool index).
  const pool = useMemo(() => buildSegments(pkgs, brand, undefined, undefined, POOL_SEGMENTS), [pkgs, brand]);
  const data = useCampaignCopy(projectId);
  // The owner's saved choices, checked against this run's pool; the defaults ($100 a day, five campaigns) otherwise.
  const [init] = useState<CampaignSettings>(() => restoreSettings(settings, pool));
  const [pos, setPos] = useState(init.pos);
  const [active, setActive] = useState<number[]>(init.active);
  const [retired, setRetired] = useState<number[]>(init.retired);
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [tab, setTab] = useState<Tab>("feed");
  const [picked, setPicked] = useState<Record<number, CreativeVariant>>(() => Object.fromEntries(Object.entries(init.picked).map(([k, v]) => [Number(k), v])));
  const [match, setMatch] = useState<CampaignSettings["match"]>(init.match);
  const [perSet, setPerSet] = useState(init.perSet);
  const [ages, setAges] = useState<CampaignSettings["ages"]>(init.ages);
  const [plats, setPlats] = useState<Platform[]>(init.plats);
  const [launched, setLaunched] = useState(init.launched);
  // Save the choices (debounced) so they are there on the next visit and on the "My campaigns" page.
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaved("saving");
    const body: CampaignSettings = { v: 1, pos, active, retired, match, perSet, ages, plats, picked: Object.fromEntries(Object.entries(picked).map(([k, v]) => [String(k), v])), launched };
    const t = setTimeout(() => {
      void api(`/api/projects/${projectId}/campaign`, { method: "PUT", body }).then((r) => setSaved(r.ok ? "saved" : "error"));
    }, 700);
    return () => clearTimeout(t);
  }, [projectId, pos, active, retired, match, perSet, ages, plats, picked, launched]);

  // More budget, more campaigns: grow from the unused pool (never-replaced segments first), or drop the last ones.
  const setBudget = (p: number) => {
    setPos(p);
    const want = Math.min(runsFor(budgetAt(p)), pool.length);
    if (want === active.length) return; // between thresholds only the dollar figures move
    setActive((cur) => {
      if (cur.length >= want) return cur.slice(0, want);
      const free = pool.map((_, n) => n).filter((n) => !cur.includes(n));
      const fresh = [...free.filter((n) => !retired.includes(n)), ...free.filter((n) => retired.includes(n))];
      return [...cur, ...fresh.slice(0, want - cur.length)];
    });
    setI((x) => Math.min(x, want - 1));
  };
  // Opened from a city on the profile map: show that campaign, zoomed to its city.
  useEffect(() => {
    if (!focus) return;
    const at = active.indexOf(focus.n);
    if (at >= 0) setI(at);
    setZoom(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const k = Math.min(i, active.length - 1);
  const { campaigns, live, budget, total } = planCampaigns(pool, { pos, active, match, perSet, ages });
  const reachOf = (c: (typeof campaigns)[number]) => c.reach;
  const cur = campaigns[k];

  // One pin per city across the running campaigns; a campaign's first place is its home pin.
  const pins = useMemo(() => {
    const by = new Map<string, Pin>();
    for (const c of campaigns) {
      if (!c.on) continue;
      for (const p of c.places) {
        const cell = heat.find((h) => h.near === p.label);
        const ll = cell ? { lat: cell.lat, lon: cell.lon } : cityCoords(p.label);
        if (!ll) continue;
        const pin = by.get(p.label) ?? { key: p.label, label: p.label, lat: ll.lat, lon: ll.lon, campaigns: [] };
        if (!pin.campaigns.includes(c.pos)) pin.campaigns.push(c.pos);
        by.set(p.label, pin);
      }
    }
    return [...by.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, perSet, ages, heat, pool]);

  if (!cur) return <div className="aw-empty">Not enough Qloo data to build campaigns yet.</div>;
  const s = cur.s;
  const rev = data?.rev ?? "t";
  const comps = pkgs.map((p) => p.competitor.name);
  const tabs = TABS.filter((t) => plats.includes(TAB_PLATFORM[t.id]));
  const showTab = tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? "feed");
  const variant = picked[cur.n] ?? VARIANTS[cur.n % VARIANTS.length];
  const copy: WallCopy = data?.copy[s.id] ?? { ...s.ad, source: "template" };
  const kit = data?.kit ?? null;
  const bname = kit?.name ?? brand;
  const img = creativeUrl(projectId, cur.n, showTab === "feed" ? "pt" : "st", variant, rev);
  const spare = pool.map((_, n) => n).filter((n) => !active.includes(n));
  const pick = (pos: number) => {
    setI(pos);
    setZoom(true);
  };
  const onPin = (p: Pin) => {
    const at = p.campaigns.indexOf(k);
    pick(at >= 0 ? p.campaigns[(at + 1) % p.campaigns.length] : p.campaigns[0]);
  };
  const replace = () => {
    const next = spare.find((n) => !retired.includes(n)) ?? spare[0];
    if (next === undefined) return;
    setRetired((r) => [...r.filter((x) => x !== next), cur.n]);
    setActive((a) => a.map((n, pos) => (pos === k ? next : n)));
    setZoom(true);
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const rows: Array<{ k: string; from: string; to: string; cite?: string }> = [
    { k: "taste", from: `Fans of ${s.comp} love ${s.taste.label}`, to: [plats.some((p) => p !== "google") && `Interests: ${cur.tastes.join(", ")}`, plats.includes("google") && `Google custom segment: ${s.taste.label}`].filter(Boolean).join(" · ") || "No platform on", cite: s.taste.cite },
    ...(plats.includes("google") ? [{ k: "rival", from: `${s.comp} is the rival Qloo matched`, to: `Google keyword: "${s.comp.toLowerCase()} alternative"` }] : []),
    { k: "place", from: `Where their fans are strongest${cur.places.length > 1 ? ` (top ${cur.places.length})` : ""}`, to: `Locations: ${cur.places.map((p) => p.label).join(", ")}`, cite: s.place.cite },
    { k: "demo", from: `${demoLabel(s.demo)} over-index`, to: cur.on ? `Age ${s.demo.band}${s.demo.gender === "everyone" ? "" : ` · ${s.demo.gender}`}` : `Paused: ${s.demo.band} is outside your age focus`, cite: s.demo.cite },
    ...(s.media ? [{ k: "media", from: `They ${s.media.kind === "podcast" ? "listen to" : "watch"} ${s.media.label}`, to: `Sponsorship: ${s.media.label}`, cite: s.media.cite }] : []),
  ];

  return (
    <div className="ag">
      <div className="ag-hero">
        <div className="ag-min">
          <p className="ag-live"><i />Your ad agency is on it · working non-stop</p>
          <h2>{live.length} campaigns, one for every segment of {list(comps.map((c) => possessive(c)))} fans</h2>
          <p className="ag-sub"><a className="ag-rivals" href={`/start?brand=${projectId}&site=${encodeURIComponent(domain)}`}>Add or change rivals ({comps.length} of 5)</a> · Each segment gets its own ads, aimed at the cities where those fans are strongest. Raise the budget and the agency opens more cities and tastes.</p>
          <p className="ag-daily"><i />The agents work daily: they re-read {list(comps.map((c) => possessive(c)))} fans on Qloo, uncover new segments and create ads for them.{scheduled === false && <> <a href={`/signup?claim=${projectId}`}>Sign up free to keep them working</a>.</>}</p>
        </div>
        <div className="ag-budget">
          <label htmlFor="ag-b">Daily budget <b>${budget.toLocaleString("en-US")}</b><span>/day · {active.length} campaigns</span></label>
          <input id="ag-b" type="range" min={0} max={SLIDER} step={1} value={pos} onChange={(e) => setBudget(Number(e.target.value))} aria-valuetext={`$${budget} a day`} style={{ "--p": `${(pos / SLIDER) * 100}%` } as React.CSSProperties} />
          <p title={BUDGET_NOTE}>≈ <b>{fmtReach(total)}</b> people a week <span className="ag-q">?</span></p>
        </div>
      </div>

      <div className="ag-body">
        <nav className="ag-segs" aria-label="Segment campaigns">
          {campaigns.map((c) => (
            <button key={c.n} type="button" className={`ag-seg${c.pos === k ? " on" : ""}${c.on ? "" : " off"}`} onClick={() => pick(c.pos)} aria-current={c.pos === k}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={creativeUrl(projectId, c.n, "sq", picked[c.n] ?? VARIANTS[c.n % VARIANTS.length], rev)} alt="" loading="lazy" />
              <span className="ag-min">
                <small>#{c.pos + 1} · {possessive(c.s.comp)} fans</small>
                <b className="ell">{c.s.taste.label} fans</b>
                <span className="ell">{demoLabel(c.s.demo)} · {c.places.map((p) => p.label).join(", ")}</span>
              </span>
              <span className="ag-reach" title={BUDGET_NOTE}>{c.on ? <>~{fmtReach(reachOf(c))}<small>/wk</small></> : <small>paused</small>}</span>
            </button>
          ))}
        </nav>

        <div className="ag-stage">
          <CampaignMap pins={pins} heat={heat} sel={k} focused={zoom} onPick={onPin} />
          <div className="ag-maptag">
            <b>{cur.places[0]?.label}</b> · campaign {k + 1}
            {zoom ? <button type="button" onClick={() => setZoom(false)}>Show all cities</button> : <span>Click a city to open its ad</span>}
          </div>
          <div className="ag-adbox">
            {tabs.length > 0 ? (
              <>
                <div className="aw-tabs" role="tablist" aria-label="Placement">
                  {tabs.map((t) => <button key={t.id} type="button" role="tab" aria-selected={showTab === t.id} className={showTab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}
                </div>
                <FitBox k={`${s.id}-${showTab}`}>
                  <div className="aw" key={`${s.id}-${showTab}`}>
                    {showTab === "feed" && <FeedFrame img={img} copy={copy} kit={kit} brand={bname} />}
                    {showTab === "story" && <StoryFrame img={img} copy={copy} kit={kit} brand={bname} />}
                    {showTab === "tiktok" && <TikTokFrame img={img} copy={copy} kit={kit} brand={bname} />}
                    {showTab === "google" && <GoogleFrame g={data?.google[s.id]} copy={copy} kit={kit} brand={bname} query={`${bname} ${s.taste.label}`.trim().toLowerCase()} />}
                  </div>
                </FitBox>
              </>
            ) : <p className="ag-none">Turn on a platform below to see this campaign&apos;s ads.</p>}
          </div>
        </div>

        <aside className="ag-plan">
          <div className="ag-nav">
            <span>Campaign <b>{k + 1}</b> of {campaigns.length}</span>
            <button type="button" onClick={() => pick((k - 1 + campaigns.length) % campaigns.length)} aria-label="Previous campaign">‹</button>
            <button type="button" onClick={() => pick((k + 1) % campaigns.length)} aria-label="Next campaign">›</button>
          </div>
          <p className="ag-hook">{copy.hook}</p>
          <p className="ag-for"><b>Segment:</b> {demoLabel(s.demo)} in {cur.places.map((p) => p.label).join(", ")} who love {s.taste.label}, people like {possessive(s.comp)} customers</p>
          <p className="ag-reachline" title={BUDGET_NOTE}>{cur.on ? <>At ${budget.toLocaleString("en-US")}/day this campaign reaches <b>~{fmtReach(reachOf(cur))}</b> of <b>~{fmtReach(cur.size)}</b> people a week</> : <>Paused by your age focus</>}</p>
          <div className="ag-tgt">
            <p className="ag-h">Targeting, straight from Qloo</p>
            {rows.map((r) => (
              <p key={r.k} className="ag-tr"><i className={`aw-k ${r.k}`} /><span><span className="from">{r.from}</span><span className="to">→ {r.to}</span></span><QlooCite id={r.cite} /></p>
            ))}
          </div>
          {showTab !== "google" && tabs.length > 0 && (
            <div className="ag-vars" role="radiogroup" aria-label="Design">
              {VARIANTS.map((v) => (
                <button key={v} type="button" role="radio" aria-checked={variant === v} className={variant === v ? "on" : ""} onClick={() => setPicked((p) => ({ ...p, [cur.n]: v }))} title={VARIANT_LABEL[v]}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={creativeUrl(projectId, cur.n, "sq", v, rev)} alt={VARIANT_LABEL[v]} loading="lazy" />
                </button>
              ))}
              <span>3 designs to test</span>
            </div>
          )}
          <p className="ag-fine">{copy.source === "glm" ? "Copy by Poachly's copywriter agent (GLM)" : data?.pending ? "The copywriter agent is still writing; rule-based copy for now" : "Copy by Poachly's rule-based writer"}, checked against platform limits.</p>
        </aside>
      </div>

      <div className="ag-tune" aria-label="Tune the campaigns with Qloo">
        <p className="ag-qloo">
          <b>Segments powered by Qloo</b>
          <span>Each segment is one competitor&apos;s fans narrowed by three live Qloo signals: a <em>taste</em> from Qloo&apos;s taste graph<QlooCite id={s.taste.cite} />, a <em>city</em> from Qloo&apos;s heatmap<QlooCite id={s.place.cite} /> and an <em>age band</em> from Qloo&apos;s audience demographics<QlooCite id={s.demo.cite} />. The levers below re-cut them from the same Qloo data.</span>
        </p>
        <div className="ag-lever">
          <span className="lb" title={MATCH.find((m) => m.id === match)!.note}>Taste match</span>
          <div className="ag-segctl">{MATCH.map((m) => <button key={m.id} type="button" className={match === m.id ? "on" : ""} onClick={() => setMatch(m.id)} title={m.note}>{m.label}</button>)}</div>
        </div>
        <div className="ag-lever">
          <span className="lb">Places per ad set</span>
          <div className="ag-segctl">{[1, 2, 3, 4].map((n) => <button key={n} type="button" className={perSet === n ? "on" : ""} onClick={() => setPerSet(n)}>{n}</button>)}</div>
        </div>
        <div className="ag-lever">
          <span className="lb" title="Dotted bands over-index among these fans in Qloo">Age focus</span>
          <div className="ag-segctl multi">{BANDS.map((b) => <button key={b} type="button" className={`${ages.includes(b) ? "on" : ""}${pool.some((x) => x.demo.band === b) ? " q" : ""}`} onClick={() => setAges((a) => toggle<CampaignSettings["ages"][number]>(a, b))}>{b}</button>)}</div>
        </div>
        <div className="ag-lever">
          <span className="lb">Platforms</span>
          <div className="ag-segctl multi">{(Object.keys(PLAT_LABEL) as Platform[]).map((p) => <button key={p} type="button" className={plats.includes(p) ? "on" : ""} onClick={() => setPlats((x) => toggle(x, p))}>{PLAT_LABEL[p]}</button>)}</div>
        </div>
        {saved !== "idle" && <span className={`ag-saved ${saved}`} aria-live="polite">{saved === "saving" ? "Saving…" : saved === "saved" ? "✓ Saved" : "Not saved"}</span>}
        <button type="button" className="ag-replace" onClick={replace} disabled={!spare.length} title={spare.length ? "Swap this campaign for the next segment in Qloo's data" : "No more segments in Qloo's data for these competitors"}>↻ Replace<span className="ag-wide"> segment</span></button>
        <button type="button" className="ag-launch" disabled={!live.length || !plats.length} onClick={() => setLaunched(true)}>{launched ? "✓ Ready (preview)" : "Launch campaign →"}</button>
      </div>
      {launched && <p className="ag-note">Preview: {live.length} campaigns are ready at ${budget.toLocaleString("en-US")}/day. Poachly does not publish or spend yet; connecting Meta, TikTok and Google Ads comes after the hackathon.</p>}
    </div>
  );
}

function list(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
