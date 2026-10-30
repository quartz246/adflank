"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { wizardView } from "@/lib/agent/wizard-view";
import type { AttackPackage } from "@/lib/types/attack";
import AgencyStudio from "./AgencyStudio";
import FanProfile from "./FanProfile";
import { possessive } from "@/lib/ads/copy";
import "./agency.css";

type View = ReturnType<typeof wizardView>;
type Full = Extract<View, { steps: unknown }>;
type Comp = Full["comps"][number];
type StepRow = Full["steps"][number];


/**
 * The six server steps shown as four stages. Steps 3-5 (Qloo's map, profile and gap) are evidence, not destinations:
 * one "Qloo says" stage while the run works, and the "Why this ad: Qloo says…" drawer under the finished campaign.
 */
const STAGES = [
  { n: [1], title: "", role: "the brand strategist's job" },
  { n: [2], title: "", role: "the market scout's job" },
  { n: [3, 4, 5], title: "Profiling their fans", role: "Qloo's taste graph does the research" },
  { n: [6], title: "Campaigns for every segment", role: "media planner, copywriter, designer and campaign manager in one" },
] as const;
const stageOf = (n: number) => (n <= 2 ? n : n <= 5 ? 3 : 4);
type Status = StepRow["status"];
function mergeStatus(list: Status[]): Status {
  if (list.includes("failed")) return "failed";
  if (list.includes("working")) return "working";
  if (list.every((x) => x === "skipped")) return "skipped";
  if (list.every((x) => x === "done" || x === "skipped")) return "done";
  return list.some((x) => x === "done" || x === "skipped") ? "working" : "queued";
}
const mmss = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** Real elapsed run time: ticks while the run is live, freezes at the finish time. */
function Clock({ start, end }: { start: string; end: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (end) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [end]);
  const ms = (end ? Date.parse(end) : now) - Date.parse(start);
  return <span className="wz-chip clock" title="Real time from paste to campaign" suppressHydrationWarning>⏱ {mmss(ms)}</span>;
}

/** Minimum time each stage stays on screen while a run is live, so people can read it before the next one. */
const DWELL_MS = [0, 3500, 4500, 11000, 0];

export default function Wizard({ projectId, initial }: { projectId: number; initial: View }) {
  const [v, setV] = useState<View>(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [ci, setCi] = useState(0);
  const [focusSeg, setFocusSeg] = useState<{ n: number; at: number } | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pacing only applies to a run watched live; reopening a finished run goes straight to its campaign.
  const watchedLive = useRef("steps" in initial && initial.run?.status === "running");
  const [disp, setDisp] = useState<number>(() => (watchedLive.current ? 1 : 4));
  const enteredAt = useRef(Date.now());

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/wizard`, { cache: "no-store" });
      if (r.ok) setV((await r.json()) as View);
    } catch {
      /* next tick retries */
    }
  }, [projectId]);

  const running = "steps" in v && v.run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const es = new EventSource(`/api/projects/${projectId}/stream`);
    const kick = () => {
      if (pending.current) return;
      pending.current = setTimeout(() => {
        pending.current = null;
        void refresh();
      }, 500);
    };
    for (const ev of ["state", "task", "call_start", "call", "log", "package"]) es.addEventListener(ev, kick);
    const iv = setInterval(() => void refresh(), 4000);
    return () => {
      es.close();
      clearInterval(iv);
    };
  }, [running, projectId, refresh]);

  const full = "steps" in v && v.run ? v : null;
  const stepsL = full?.steps ?? [];
  const doneL = full?.run?.status === "done";
  const failedL = full?.run?.status === "failed";
  const activeL = stepsL.find((s) => s.status === "working" || s.status === "failed")?.n ?? (doneL ? 6 : stepsL.find((s) => s.status === "queued")?.n ?? 1);
  const campaignReady = doneL || (stepsL[5]?.status === "done" && (full?.comps.every((c) => c.done) ?? false));
  // The stage the run has reached; the profile stays up while the campaign is being designed (it is what feeds it).
  const target = campaignReady ? 4 : failedL ? stageOf(activeL) : Math.min(3, stageOf(activeL));
  useEffect(() => {
    if (disp === target) return;
    if (disp > target || !watchedLive.current) {
      setDisp(target);
      enteredAt.current = Date.now();
      return;
    }
    const wait = Math.max(0, DWELL_MS[disp] - (Date.now() - enteredAt.current));
    const t = setTimeout(() => {
      setDisp((d) => d + 1);
      enteredAt.current = Date.now();
    }, wait);
    return () => clearTimeout(t);
  }, [disp, target]);

  if (!full || !v.run || !("steps" in v)) return <div className="wz"><div className="wz-empty">This project has no run yet.</div></div>;
  const steps = v.steps;
  const done = v.run.status === "done";
  const activeN = activeL;
  const finished = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  const shownStage = sel ?? disp;
  const shown = STAGES[shownStage - 1].n[0];
  const stages = STAGES.map((g, i) => {
    const rows = g.n.map((n) => steps[n - 1]).filter(Boolean);
    const status = rows.length === 1 ? rows[0].status : mergeStatus(rows.map((r) => r.status));
    const cur = rows.find((r) => r.status === "working") ?? rows.find((r) => r.status === "failed");
    const note = rows.length === 1 ? rows[0].note : cur?.note || (status === "done" ? "where · who · what they love" : "");
    return { i: i + 1, first: g.n[0], title: g.title || rows[0]?.title || "", role: g.role, status, note, rows };
  });
  const stage = stages[shownStage - 1];
  const activeStage = stageOf(activeN);
  const pick = (g: (typeof stages)[number]) => setSel(disp === g.i ? null : g.i);
  const final = shownStage === 4 && campaignReady;

  return (
    <div className="wz">
      <header className="wz-top">
        <a href="/" className="wz-logo"><span className="wz-mark">P</span>Poachly</a>
        <div className="wz-top-r">
          {v.guest ? <a className="wz-acct" href={`/signup?claim=${projectId}`}>Save your campaigns</a> : <a className="wz-acct" href="/campaigns">My campaigns</a>}
          {v.run.startedAt && <Clock start={v.run.startedAt} end={done || v.run.status === "failed" ? v.run.finishedAt : null} />}
          {done ? <span className="wz-chip ok"><i className="dot" />Campaign ready</span> : v.run.status === "failed" ? <span className="wz-chip bad">Run stopped</span> : v.ahead > 0 ? <span className="wz-chip"><i className="spin" />In line · starting soon</span> : <span className="wz-chip"><i className="spin" />Step {activeStage} of 4</span>}
        </div>
      </header>
      <div className={`wz-body fit${final ? " wide" : ""}`} data-step={shown} data-stage={shownStage} data-run={v.run.status} data-cta={done ? 1 : 0}>
        <aside className="wz-side">
          <div className="wz-brand">
            <span className="wz-fav">{(v.brand?.name ?? v.project.name).slice(0, 1).toUpperCase()}</span>
            <div className="min0">
              <b className="ell">{v.brand?.name ?? v.site?.name ?? v.project.name}</b>
              <span className="mono ell">{v.site?.domain ?? v.project.name}</span>
            </div>
          </div>
          <ol className="wz-steps">
            {stages.map((g) => (
              <li key={g.i} className={`wz-step ${g.status}${stage.i === g.i ? " sel" : ""}`}>
                <button type="button" disabled={g.status === "queued"} onClick={() => pick(g)}>
                  <span className="wz-ic">{g.status === "done" ? <Check /> : g.status === "working" ? <i className="spin" /> : g.status === "failed" ? "!" : g.status === "skipped" ? "–" : g.i}</span>
                  <span className="min0">
                    <span className="t">{g.title}</span>
                    <span className="n ell">{g.status === "working" ? (g.note || "working…") : g.status === "queued" ? (v.ahead > 0 && g.i === 1 ? "waiting for a free agent…" : "queued") : g.note || g.status}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {v.comps.length > 0 && (
            <div className="wz-seg">
              <p className="wz-eyebrow">Competitors</p>
              {v.comps.map((c, i) => (
                <button key={c.name} type="button" className={`wz-segrow${i === ci ? " on" : ""}`} onClick={() => setCi(i)}>
                  <span className="wz-fav sm">{c.name.slice(0, 1)}</span>
                  <span className="ell">{c.name}</span>
                  <span className="cnt">{c.done ? <Check /> : `${c.calls} call${c.calls === 1 ? "" : "s"}`}</span>
                </button>
              ))}
            </div>
          )}
          <Terminal v={v} activeN={activeStage} />
        </aside>

        <main className="wz-main">
          <div className="wz-head">
            <h1>{stage.title}</h1>
            <span className="sub">Step {stage.i} of 4 · <span className="wz-role">{stage.role}</span>{final && v.run.finishedAt ? <> · built in <b>{mmss(Date.parse(v.run.finishedAt) - Date.parse(v.run.startedAt))}</b></> : null}</span>
            <span className={`wz-chip ${stage.status === "done" ? "ok" : stage.status === "failed" ? "bad" : ""}`} style={{ marginLeft: "auto" }}>
              {stage.status === "working" && <i className="spin" />}
              {stage.status}
            </span>
          </div>
          <div className="wz-bar"><i style={{ width: `${(finished / 6) * 100}%` }} /></div>

          {v.run.status === "failed" && <div className="wz-alert">{v.run.error?.replace(/\.$/, "")}. <a href="/">Try another website</a>.</div>}

          <div className={`wz-content s${shownStage}`} key={shownStage}>
            {shownStage === 1 && <StepSite v={v} st={steps[0]} />}
            {shownStage === 2 && <StepMarket v={v} st={steps[1]} onPick={(i) => { setCi(i); setSel(3); }} />}
            {shownStage === 3 && (v.comps.length
              ? <FanProfile comps={v.comps.map((c) => ({ name: c.name, done: c.done, pkg: c.pkg as AttackPackage, heat: c.heat }))} ci={ci} onPick={setCi} brand={v.brand?.name ?? v.project.name} country={v.project.country ?? "US"} designing={!campaignReady && steps[5]?.status === "working"} projectId={projectId} ready={campaignReady} onOpen={(n) => { setFocusSeg({ n, at: Date.now() }); setSel(4); }} />
              : steps.slice(2, 5).every((r) => r.status === "skipped") ? <div className="wz-card muted">{steps[2].note}</div> : <Skeleton />)}
            {shownStage === 4 && (campaignReady && v.comps.length
              ? <AgencyStudio pkgs={v.comps.map((c) => c.pkg as AttackPackage)} brand={v.brand?.name ?? v.project.name} start={`/go/${projectId}/campaign`} focus={focusSeg} heat={v.comps.flatMap((c) => c.heat)} scheduled={"scheduled" in v.project ? v.project.scheduled : undefined} settings={v.settings} />
              : <Skeleton rows={4} />)}
          </div>

          {done && !final && sel !== null && (
            <div className="wz-cta slim">
              <span>Keep Poachly watching {v.comps.map((c) => c.name).join(" and ")} every day · {v.qlooCalls} cited Qloo calls</span>
              <a className="wz-btn sm" href={`/go/${projectId}/campaign`}>Start campaign →</a>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Check() {
  return <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Terminal({ v, activeN }: { v: Full; activeN: number }) {
  const lines = v.terminal.slice(-5);
  const live = v.run?.status === "running";
  return (
    <div className="wz-term">
      <p className="hd"><i className={`dot ${live ? "" : v.run?.status === "failed" ? "bad" : "ok"}`} />{live ? (v.ahead > 0 ? "All agents busy: you are next in line" : `Working on step ${activeN} of 4`) : v.run?.status === "done" ? "Run complete" : "Run stopped"}</p>
      {lines.map((l, i) => {
        const last = i === lines.length - 1 && live;
        return (
          <p key={`${l.at}-${i}`} className={`ln k-${l.kind}${last ? " cur" : ""}`}>
            <span className="g">{last ? ">" : l.kind === "callfail" || l.kind === "error" ? "×" : "✓"}</span>
            <span className="ell">{l.text}</span>
            {last && <span className="caret" />}
          </p>
        );
      })}
    </div>
  );
}

function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="wz-card sk">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skrow"><i className="b sq" /><span><i className="b" style={{ width: `${30 + ((i * 37) % 25)}%` }} /><i className="b sm" /></span><i className="b r" /><i className="b r2" /></div>
      ))}
    </div>
  );
}

function StepSite({ v, st }: { v: Full; st: StepRow }) {
  void st;
  if (!v.site) {
    if (st.status !== "done" || !v.brand) return <Skeleton rows={2} />;
    return <div className="wz-card site"><div className="row"><span className="wz-fav lg">{v.brand.name.slice(0, 1)}</span><h2>{v.brand.name}</h2></div></div>;
  }
  const s = v.site;
  return (
    <div className="wz-card site">
      <div className="row">
        <span className="wz-fav lg">{s.name.slice(0, 1).toUpperCase()}</span>
        <div className="min0">
          <h2>{s.name}</h2>
          <a className="mono" href={s.url} target="_blank" rel="noreferrer">{s.domain}</a>
        </div>
      </div>
      {s.title && <p className="q">“{s.title}”</p>}
      {s.description && <p>{s.description}</p>}
      {!s.ok && <p className="muted">We could not read the page ({s.note}), so we went on with the domain name.</p>}
    </div>
  );
}

function StepMarket({ v, st, onPick }: { v: Full; st: StepRow; onPick: (i: number) => void }) {
  if (!v.comps.length) return st.status === "done" || st.status === "skipped" ? <div className="wz-card">The agent could not pick a competitor for this brand yet.</div> : <Skeleton rows={3} />;
  return (
    <div className="stack">
      {v.market?.source === "picked by you" ? (
        <p className="lede">You picked the rivals. Poachly&apos;s agents go after the customers of:</p>
      ) : v.market?.kind === "proxy" ? (
        <p className="lede">
          {possessive(v.brand?.name ?? "")} buyers also shop with big brands, so the agent picked the brands whose fans are the people {v.brand?.name} wants.
          Poachly profiles the customers of:
        </p>
      ) : (
        <p className="lede">
          {v.market?.pool ? `Qloo returned ${v.market.pool} brands that ${possessive(v.brand?.name ?? "")} fans also like. ` : ""}
          The agent kept the direct competitors. Poachly will go after the customers of:
        </p>
      )}
      <div className="wz-grid">
        {v.comps.map((c, i) => (
          <button type="button" key={c.name} className="wz-card rival" onClick={() => onPick(i)}>
            <span className="wz-fav lg">{c.name.slice(0, 1)}</span>
            <span className="min0"><b>{c.name}</b><span className="muted small">in Qloo as {c.qlooName ?? c.name}</span></span>
            <span className="tag">{v.market?.kind === "proxy" ? "audience" : "target"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
