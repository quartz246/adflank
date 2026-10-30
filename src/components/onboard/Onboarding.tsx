"use client";

import { useState } from "react";
import { api } from "@/components/core/api";
import { BANDS, budgetAt, PLAT_LABEL, PLATFORMS, runsFor, SLIDER, type Platform } from "@/lib/campaign/plan";

/**
 * "Set it up step by step": website, rivals ticked from Qloo's list (or searched in Qloo), market and age focus, then
 * platforms and daily budget. Every step can be skipped (the agents decide). The left panel is the agency brief, filled in
 * as the owner chooses. Starting posts everything to /api/go, which sets the rivals and preferences before the run.
 */
interface Rival { id: string; name: string; popularity?: number; note?: string }
interface Suggest { brand: { name: string; found: boolean; note?: string }; site: { domain: string; title: string }; rivals: Rival[] }
type Step = 1 | 2 | 3 | 4;
const MAX = 2;
const STEPS = ["Your website", "Rivals", "Market & audience", "Platforms & budget"];

const pctl = (p?: number) => (typeof p === "number" ? `top ${Math.max(1, Math.round((1 - p) * 100))}% on Qloo` : "");

export default function Onboarding({ countries, initialSite }: { countries: Array<{ code: string; name: string }>; initialSite: string }) {
  const [step, setStep] = useState<Step>(1);
  const [site, setSite] = useState(initialSite);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [sug, setSug] = useState<Suggest | null>(null);
  const [list, setList] = useState<Rival[]>([]);
  const [picked, setPicked] = useState<Rival[]>([]);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("US");
  const [ages, setAges] = useState<string[]>([]);
  const [plats, setPlats] = useState<Platform[]>([...PLATFORMS]);
  const [pos, setPos] = useState(SLIDER / 2);
  const budget = budgetAt(pos);

  const toggle = <T,>(xs: T[], v: T) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]);
  const pick = (r: Rival) =>
    setPicked((cur) => (cur.some((x) => x.id === r.id) ? cur.filter((x) => x.id !== r.id) : cur.length >= MAX ? [...cur.slice(1), r] : [...cur, r]));

  async function readWebsite() {
    setErr("");
    setBusy("Reading your website and asking Qloo who your fans also love…");
    const r = await api<Suggest>("/api/onboard/suggest", { body: { site } });
    setBusy("");
    if (!r.ok) return setErr(r.data.error ?? "Could not read that website.");
    setSug(r.data);
    setList(r.data.rivals);
    setPicked(r.data.rivals.slice(0, MAX));
    setStep(2);
  }
  async function search() {
    if (q.trim().length < 2) return;
    setErr("");
    setBusy(`Looking up ${q.trim()} in Qloo…`);
    const r = await api<{ rivals: Rival[] }>("/api/onboard/search", { body: { name: q.trim() } });
    setBusy("");
    if (!r.ok) return setErr(r.data.error ?? "Qloo did not answer.");
    if (!r.data.rivals.length) return setErr(`Qloo does not know ${q.trim()} as a brand. Try another spelling.`);
    setList((cur) => [...r.data.rivals.filter((x) => !cur.some((y) => y.id === x.id)), ...cur]);
    pick(r.data.rivals[0]);
    setQ("");
  }
  async function start() {
    setErr("");
    setBusy("Starting the agents…");
    const body = {
      site,
      countryCode: country,
      ...(picked.length ? { competitors: picked.map((r) => ({ id: r.id, name: r.name })) } : {}),
      prefs: { pos, plats, ages },
    };
    const r = await api<{ projectId: number }>("/api/go", { body });
    if (!r.ok) {
      setBusy("");
      return setErr(r.data.error ?? "Could not start. Try again.");
    }
    window.location.href = `/go/${r.data.projectId}`;
  }

  const next = () => setStep((s) => (Math.min(4, s + 1) as Step));
  const countryLabel = countries.find((c) => c.code === country)?.name ?? country;

  return (
    <div className="ob-card">
      <aside className="ob-brief" aria-label="Your agency brief">
        <a className="ob-back" href={step === 1 ? "/" : undefined} onClick={step === 1 ? undefined : (e) => { e.preventDefault(); setStep((s) => (Math.max(1, s - 1) as Step)); }} role="button">← {step === 1 ? "Home" : "Back"}</a>
        <p className="ob-eyebrow">Your agency brief</p>
        <dl>
          <div className={sug ? "on" : ""}><dt>Brand</dt><dd>{sug ? <>{sug.brand.name}<small>{sug.site.domain}{sug.brand.found ? " · in Qloo" : " · not in Qloo"}</small></> : site ? <span className="dim">{site}</span> : <span className="dim">your website</span>}</dd></div>
          <div className={picked.length ? "on" : ""}><dt>Win the customers of</dt><dd>{picked.length ? picked.map((r) => r.name).join(" and ") : <span className="dim">{step > 2 ? "the agents pick" : "rivals you tick"}</span>}</dd></div>
          <div className={step > 3 ? "on" : ""}><dt>Market</dt><dd>{countryLabel}{ages.length ? <small>ages {ages.join(", ")}</small> : <small>ages Qloo finds</small>}</dd></div>
          <div className={step > 3 ? "on" : ""}><dt>Ads on</dt><dd>{plats.length ? plats.map((p) => PLAT_LABEL[p]).join(", ") : <span className="dim">no platform</span>}</dd></div>
          <div className={step > 3 ? "on" : ""}><dt>Daily budget</dt><dd>${budget.toLocaleString("en-US")}<small>{runsFor(budget)} campaigns to start</small></dd></div>
        </dl>
        <p className="ob-q"><b>Qloo</b> finds the rivals, where their fans are, who they are and what they love. The agents turn it into a campaign for every segment.</p>
      </aside>

      <section className="ob-main">
        <ol className="ob-steps" aria-label="Setup steps">
          {STEPS.map((t, i) => <li key={t} className={i + 1 === step ? "cur" : i + 1 < step ? "done" : ""}><span>{i + 1 < step ? "✓" : i + 1}</span>{t}</li>)}
        </ol>

        {step === 1 && (
          <form className="ob-pane" onSubmit={(e) => { e.preventDefault(); void readWebsite(); }}>
            <h1>Which brand is yours?</h1>
            <p className="ob-sub">Paste your website. Poachly reads it and asks Qloo which brands your fans also love.</p>
            <label className="ob-field" htmlFor="ob-site"><span>https://</span><input id="ob-site" autoFocus required value={site} onChange={(e) => setSite(e.target.value)} placeholder="allbirds.com" autoComplete="url" inputMode="url" spellCheck={false} /></label>
            <button className="ob-go" disabled={!!busy || site.trim().length < 3}>Continue</button>
          </form>
        )}

        {step === 2 && sug && (
          <div className="ob-pane">
            <h1>Whose customers do you want?</h1>
            <p className="ob-sub">{list.length ? <>Brands <b>{sug.brand.name}</b>&apos;s fans also love, from Qloo. Tick up to {MAX}.</> : <><b>{sug.brand.name}</b> is not in Qloo yet, so search for your rivals by name.</>}</p>
            <form className="ob-search" onSubmit={(e) => { e.preventDefault(); void search(); }}>
              <input id="ob-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Qloo for a rival, e.g. Nike" aria-label="Search Qloo for a rival" />
              <button disabled={!!busy || q.trim().length < 2}>Search</button>
            </form>
            <ul className="ob-list" role="listbox" aria-multiselectable="true" aria-label="Rivals">
              {list.map((r) => {
                const on = picked.some((x) => x.id === r.id);
                return (
                  <li key={r.id} role="option" aria-selected={on} className={on ? "on" : ""} onClick={() => pick(r)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); pick(r); } }} tabIndex={0}>
                    <span className="box" aria-hidden>{on ? "✓" : ""}</span>
                    <span className="av" aria-hidden>{r.name.slice(0, 1).toUpperCase()}</span>
                    <span className="min0"><b>{r.name}</b><small>{[pctl(r.popularity), r.note].filter(Boolean).join(" · ") || "in Qloo's taste graph"}</small></span>
                  </li>
                );
              })}
            </ul>
            <button className="ob-go" onClick={next} disabled={!!busy}>{picked.length ? `Continue with ${picked.map((r) => r.name).join(" and ")}` : "Continue"}</button>
            <p className="ob-skip"><button type="button" onClick={() => { setPicked([]); next(); }}>Skip for now</button> · the agents pick the rivals from Qloo</p>
          </div>
        )}

        {step === 3 && (
          <div className="ob-pane">
            <h1>Where, and who?</h1>
            <p className="ob-sub">Qloo maps where the rivals&apos; fans are inside this market, and their age skew.</p>
            <label className="ob-label" htmlFor="ob-country">Market</label>
            <select id="ob-country" className="ob-select" value={country} onChange={(e) => setCountry(e.target.value)}>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <p className="ob-label">Age focus <small>optional</small></p>
            <div className="ob-chips">{BANDS.map((b) => <button key={b} type="button" className={ages.includes(b) ? "on" : ""} aria-pressed={ages.includes(b)} onClick={() => setAges((a) => toggle(a, b))}>{b}</button>)}</div>
            <button className="ob-go" onClick={next}>Continue</button>
            <p className="ob-skip"><button type="button" onClick={() => { setAges([]); next(); }}>Skip for now</button> · target the age bands Qloo finds over-indexed</p>
          </div>
        )}

        {step === 4 && (
          <div className="ob-pane">
            <h1>Where should the ads run?</h1>
            <p className="ob-sub">Pick the platforms and a daily budget. More budget opens more cities and tastes. Nothing is published or spent before you approve it.</p>
            <p className="ob-label">Platforms</p>
            <div className="ob-chips big">{PLATFORMS.map((p) => <button key={p} type="button" className={plats.includes(p) ? "on" : ""} aria-pressed={plats.includes(p)} onClick={() => setPlats((x) => toggle(x, p))}>{PLAT_LABEL[p]}</button>)}</div>
            <label className="ob-label" htmlFor="ob-budget">Daily budget <b>${budget.toLocaleString("en-US")}</b> <small>{runsFor(budget)} campaigns to start</small></label>
            <input id="ob-budget" className="ob-range" type="range" min={0} max={SLIDER} step={1} value={pos} onChange={(e) => setPos(Number(e.target.value))} style={{ "--p": `${(pos / SLIDER) * 100}%` } as React.CSSProperties} aria-valuetext={`$${budget} a day`} />
            <button className="ob-go" onClick={() => void start()} disabled={!!busy || !plats.length}>Start the agents →</button>
          </div>
        )}

        {busy && <p className="ob-busy" role="status"><i className="spin" />{busy}</p>}
        {err && <p className="ob-err" role="alert">{err}</p>}
      </section>
    </div>
  );
}
