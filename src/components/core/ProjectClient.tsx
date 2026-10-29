"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttackPackage, Creator } from "@/lib/types/attack";
import { api } from "./api";

type Entity = { id: number; role: "brand" | "competitor"; name: string; qloo_id: string | null; qloo_name: string | null; status: string; candidates: Array<{ id: string; name: string; type?: string }> | null };
type Run = { id: string; status: string; trigger: string; llm_model_used: string | null; llm_fallback_reason: string | null; qloo_mode: string | null; error: string | null; started_at: string; finished_at: string | null };
type Task = { id: number; role: string; competitor: string | null; title: string; status: string; detail: string | null };
type Call = { cite_id: string; n: number; tool: string; args: Record<string, unknown> | null; ok: number; status: string; summary: string | null; filled_by: "llm" | "code"; competitor: string | null; duration_ms: number | null; at: string };
type Log = { id: number; kind: string; text: string; at: string };
type Board = { run: Run; tasks: Task[]; calls: Call[]; log: Log[]; packages: Array<{ competitor: string; copySource: string | null }>; dropped: number };
type Pending = { key: string; tool: string; competitor: string | null; filledBy: string; args: unknown };
type View = {
  project: { id: number; name: string; country_code: string; city: string | null; schedule_daily: number; landing_url?: string | null };
  entities: Entity[];
  runs: Run[];
  lastRunId: string | null;
  latestDoneRunId: string | null;
  packages: Array<{ copySource: string | null; pkg: AttackPackage }>;
  chat: Array<{ id: number; role: "user" | "assistant"; content: string; model: string | null }>;
};

const short = (v: unknown, max = 90) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const statusBadge = (s: string) => (s === "done" || s === "found" || s === "ok" ? "badge ok" : s === "running" || s === "queued" ? "badge run" : s === "failed" || s === "not_found" || s === "error" ? "badge bad" : "badge warn");

export default function ProjectClient({ initial, initialBoard, modes, demo = false }: { initial: View; initialBoard: Board | null; modes: { llm: string; qloo: string }; demo?: boolean }) {
  const [view, setView] = useState<View>(initial);
  const [board, setBoard] = useState<Board | null>(initialBoard);
  const [pending, setPending] = useState<Pending[]>([]);
  const [cite, setCite] = useState<string | null>(null);
  const [citeData, setCiteData] = useState<unknown>(null);
  const [err, setErr] = useState("");
  const pid = view.project.id;

  const refresh = useCallback(async () => {
    const r = await api<View>(`/api/projects/${pid}`);
    if (r.ok) setView(r.data);
  }, [pid]);

  // Live board over SSE: the server replays the latest run state on connect.
  useEffect(() => {
    const es = new EventSource(`/api/projects/${pid}/stream`);
    es.addEventListener("state", (e) => {
      const s = JSON.parse((e as MessageEvent).data) as Board | null;
      setBoard(s);
      setPending([]);
      if (s && s.run.status !== "running") void refresh();
    });
    es.addEventListener("task", (e) => {
      const { task } = JSON.parse((e as MessageEvent).data) as { task: Task };
      setBoard((b) => (b ? { ...b, tasks: [...b.tasks.filter((t) => t.id !== task.id), task].sort((x, y) => x.id - y.id) } : b));
    });
    es.addEventListener("call_start", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { tool: string; competitor: string | null; filledBy: string; args: unknown };
      setPending((p) => [...p, { key: `${d.tool}-${Date.now()}-${Math.random()}`, tool: d.tool, competitor: d.competitor, filledBy: d.filledBy, args: d.args }]);
    });
    es.addEventListener("call", (e) => {
      const { call } = JSON.parse((e as MessageEvent).data) as { call: Call & { args_json?: string } };
      const c: Call = { ...call, args: call.args ?? (call.args_json ? JSON.parse(call.args_json) : null) };
      setPending((p) => {
        const i = p.findIndex((x) => x.tool === c.tool && x.competitor === c.competitor);
        return i < 0 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
      });
      setBoard((b) => (b ? { ...b, calls: [...b.calls.filter((x) => x.cite_id !== c.cite_id), c] } : b));
    });
    es.addEventListener("log", (e) => {
      const { log } = JSON.parse((e as MessageEvent).data) as { log: Log };
      setBoard((b) => (b ? { ...b, log: [...b.log.filter((l) => l.id !== log.id), log] } : b));
    });
    return () => es.close();
  }, [pid, refresh]);

  useEffect(() => {
    if (!cite) return;
    setCiteData(null);
    void api(`/api/calls/${cite}`).then((r) => setCiteData(r.ok ? r.data : { error: r.data.error }));
  }, [cite]);

  async function startRun() {
    setErr("");
    const r = await api<{ runId: string }>(`/api/projects/${pid}/runs`, { body: {} });
    if (!r.ok) setErr(r.data.error ?? "Could not start a run.");
  }

  const running = board?.run.status === "running";
  const competitors = view.entities.filter((e) => e.role === "competitor");
  const brand = view.entities.find((e) => e.role === "brand");
  const boardFirst = running || view.packages.length === 0;

  const packagesSection = (
    <section className="stack" id="packages">
      <div className="section-title">
        <h2>Attack packages</h2>
        {view.latestDoneRunId && <span className="small muted">from run <span className="mono">{view.latestDoneRunId}</span></span>}
        {view.packages.length > 0 && <a className="btn secondary small" href={`/projects/${pid}/ads`} style={{ marginLeft: "auto" }}>Open the ad templates <span className="arrow" aria-hidden>→</span></a>}
      </div>
      {view.packages.length === 0 && (
        <div className="empty">
          <div className="icon" aria-hidden>{running ? "…" : "◎"}</div>
          <h3>{running ? "The team is working on the first packages" : "No attack packages yet"}</h3>
          <p className="small" style={{ maxWidth: 460, margin: "0 auto" }}>
            {running
              ? "Follow the Workers' Qloo calls on the live board. One package per competitor appears here when the run finishes."
              : "Press Run now. The team builds one package per competitor: where to advertise, who to reach, the taste gap to use and the copy."}
          </p>
        </div>
      )}
      {view.packages.map(({ pkg, copySource }) => <PackageCard key={pkg.competitor.name} pkg={pkg} copySource={copySource} onCite={setCite} cite={cite} />)}
    </section>
  );

  const boardSection = (
    <section className="card" id="board">
      <div className="card-head">
        <div>
          <h2>Live board</h2>
          <p className="card-sub">The Planner&apos;s tasks and every Qloo call the Workers make, as they happen.</p>
        </div>
        {board && (
          <div className="row small">
            <span className={statusBadge(board.run.status)}><span className={`dot ${running ? "run" : board.run.status === "done" ? "ok" : board.run.status === "failed" ? "bad" : "warn"}`} />{board.run.status}</span>
            <span className="badge plain" title="Model that ran">ran on {board.run.llm_model_used ?? "…"}</span>
            <span className="badge plain">Qloo {board.run.qloo_mode}</span>
            {board.dropped > 0 && <span className="badge warn">{board.dropped} tool call(s) dropped by the gate</span>}
          </div>
        )}
      </div>
      {!board && (
        <div className="empty">
          <div className="icon" aria-hidden>▶</div>
          <h3>No run yet</h3>
          <p className="small" style={{ margin: "0 auto 12px", maxWidth: 420 }}>Press Run now, or wait for the daily run. The Planner&apos;s tasks and each Worker&apos;s Qloo calls appear here live.</p>
          <button className="btn" onClick={startRun}>Run now</button>
        </div>
      )}
      {board && (
        <div className="stack">
          {running && <RunProgress board={board} pending={pending.length} />}
          {board.run.llm_fallback_reason && <p className="notice warn small" style={{ margin: 0 }}>Model fallback: {board.run.llm_fallback_reason}</p>}
          {board.run.error && <p className="notice bad" style={{ margin: 0 }}>{board.run.error}</p>}
          <div className="lanes">
            <div className="lane">
              <h3>Planner and Workers <span className="faint">{board.tasks.filter((t) => t.status === "done").length}/{board.tasks.length}</span></h3>
              {board.tasks.length === 0 && <div className="stack tight"><div className="skeleton" /><div className="skeleton" style={{ width: "70%" }} /></div>}
              {board.tasks.map((t) => (
                <div key={t.id} className={`task ${roleClass(t.role)}`}>
                  <span className={`avatar ${roleClass(t.role)}`} aria-hidden>{t.role.slice(0, 1).toUpperCase()}</span>
                  <div className="grow">
                    <div className="row between" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                      <span className="t">{t.title}</span>
                      <span className={statusBadge(t.status)}>{t.status === "running" && <span className="dot run" />}{t.status}</span>
                    </div>
                    <div className="row" style={{ marginTop: 2 }}><span className={`role ${roleClass(t.role)}`}>{t.role}</span></div>
                    {t.detail && <div className="d">{t.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="lane">
              <h3>Qloo calls <span className="faint">{board.calls.length}{pending.length > 0 ? ` + ${pending.length} in flight` : ""}</span></h3>
              <div className="scroll">
                {pending.map((p) => (
                  <div key={p.key} className="call pending">
                    <span className="dot run" style={{ marginTop: 6 }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="tool">{toolLabel(p.tool)} <span className="faint small">calling…</span></div>
                      <div className="args" title={short(p.args, 400)}>{argsLabel(p.args)}</div>
                      <div className="meta"><span>{p.competitor ?? "name check"}</span><span className={p.filledBy === "llm" ? "role worker" : "role"}>{p.filledBy === "llm" ? "chosen by GLM" : "filled by code"}</span></div>
                    </div>
                    <div className="who" />
                  </div>
                ))}
                {board.calls.length === 0 && pending.length === 0 && <p className="small muted" style={{ margin: 4 }}>Waiting for the first call…</p>}
                {[...board.calls].reverse().map((c) => (
                  <div key={c.cite_id} id={c.cite_id} className={`call callrow${cite === c.cite_id ? " sel" : ""}`}>
                    <span className={`dot ${c.ok ? "ok" : "bad"}`} style={{ marginTop: 6 }} title={c.status} />
                    <div style={{ minWidth: 0 }}>
                      <div className="tool">{toolLabel(c.tool)} {!c.ok && <span className="badge bad">{c.status}</span>}</div>
                      <div className="args" title={short(c.args, 400)}>{argsLabel(c.args)}</div>
                      <div className="meta"><span>{c.competitor ?? "name check"}</span><span className={c.filled_by === "llm" ? "role worker" : "role"}>{c.filled_by === "llm" ? "chosen by GLM" : "filled by code"}</span>{c.duration_ms != null && c.duration_ms >= 100 && <span className="faint">{(c.duration_ms / 1000).toFixed(1)} s</span>}</div>
                    </div>
                    <div className="who">
                      <button className={`cite${cite === c.cite_id ? " sel" : ""}`} title="Show the stored Qloo call" onClick={() => setCite(c.cite_id)}>{citeLabel(c.cite_id)}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <details className="more" open={running}>
            <summary>Run log ({board.log.length})</summary>
            <div className="log" style={{ marginTop: 8 }}>
              {board.log.map((l) => <div key={l.id}><span className="ts">{l.at.slice(11, 19)}</span><span className={`k ${l.kind}`}>{l.kind}</span>{l.text}</div>)}
            </div>
          </details>
        </div>
      )}
    </section>
  );

  return (
    <div className="stack loose">
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="crumbs"><a href="/projects">Projects</a> / {view.project.name}</div>
          <h1>{view.project.name}</h1>
          <div className="row small">
            <span className="badge">Market: {view.project.city ? `${view.project.city}, ` : ""}{view.project.country_code}</span>
            <span className={view.project.schedule_daily ? "badge ok" : "badge"}>Daily run {view.project.schedule_daily ? "on" : "off"}</span>
            <span className="badge plain">Qloo: {modes.qloo}</span>
            <span className="badge plain" title="The model configured for new runs; the board shows the model each run actually used">LLM: {modes.llm} (configured)</span>
          </div>
        </div>
        <div className="row">
          <a className="btn secondary" href={`/projects/${pid}/ads`}>Ad templates</a>
          <button className="btn" onClick={startRun} disabled={running}>{running ? <><span className="dot run" /> Running…</> : "Run now"}</button>
        </div>
      </div>
      {err && <p className="notice bad" role="alert" style={{ margin: 0 }}>{err}</p>}
      {demo && (
        <p className="notice info" style={{ margin: 0 }}>
          <span><b>Shared demo project.</b> It is read-only (runs and chat work, within limits). <a href="/signup">Sign up</a> in seconds to add your own brand and competitors.</span>
        </p>
      )}

      <nav className="subnav" aria-label="Project sections">
        {boardFirst ? <><a href="#board">Live board{running ? <span className="dot run" /> : null}</a><a href="#packages">Attack packages</a></> : <><a href="#packages">Attack packages<span className="count">{view.packages.length}</span></a><a href="#board">Live board</a></>}
        <a href="#boss-chat">Boss chat</a>
        <a href="#entities">Brand and competitors</a>
        <a href={`/projects/${pid}/ads`}>Ad templates</a>
      </nav>

      <div className="split">
        <div className="stack loose" style={{ minWidth: 0 }}>
          {boardFirst ? <>{boardSection}{packagesSection}</> : <>{packagesSection}{boardSection}</>}
        </div>
        <aside className="stack" style={{ minWidth: 0 }}>
          <Chat pid={pid} initial={view.chat} competitor={competitors[0]?.name} />
          <Entities pid={pid} brand={brand} competitors={competitors} onChange={refresh} demo={demo}>
            {!demo && <Landing pid={pid} initial={view.project.landing_url ?? ""} />}
          </Entities>
        </aside>
      </div>

      {cite && (
        <>
          <button className="scrim" aria-label="Close the Qloo call" onClick={() => setCite(null)} />
          <div className="drawer" role="dialog" aria-label={`Qloo call ${cite}`}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Source</p>
                <h3 className="mono" style={{ margin: 0 }}>{cite}</h3>
              </div>
              <button className="btn secondary small" onClick={() => setCite(null)}>Close</button>
            </div>
            <p className="small muted">The stored Qloo call behind this claim (slimmed data).</p>
            <pre className="mono">{citeData ? JSON.stringify(citeData, null, 2) : "Loading…"}</pre>
          </div>
        </>
      )}
    </div>
  );
}

const ROLES = ["boss", "planner", "worker", "composer"];
const roleClass = (r: string) => (ROLES.includes(r) ? r : "worker");
const toolLabel = (t: string) => t.replace(/^qloo_/, "").replace(/_/g, " ");
const citeLabel = (id: string) => {
  const n = id.split("_").pop();
  return n ? `q${n}` : id;
};
const ID_LIKE = /^(urn:|[0-9a-f]{8}-[0-9a-f]{4}-)/i;
/** Short, readable tool arguments for the board: entity ids collapse to a count; the full JSON stays in the tooltip. */
const argsLabel = (args: unknown) => {
  if (!args || typeof args !== "object" || Array.isArray(args)) return short(args);
  const parts = Object.entries(args as Record<string, unknown>).map(([k, v]) => {
    const vals = Array.isArray(v) ? v : [v];
    if (vals.length > 0 && vals.every((x) => typeof x === "string" && ID_LIKE.test(x))) return `${k.replace(/_/g, " ")}: ${vals.length === 1 ? "1 entity" : `${vals.length} entities`}`;
    return `${k.replace(/_/g, " ")}: ${vals.map((x) => (typeof x === "object" ? "…" : String(x))).join(", ")}`;
  });
  return short(parts.join(" · "), 120);
};
const pct = (n: number) => `${n > 0 ? "+" : ""}${Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(1)}%`;
const isNear = (w: { city?: string; region?: string }) => /^near\s/.test(w.city ?? w.region ?? "");
const placeLabel = (w: { city?: string; region?: string }) => `${w.city ?? w.region ?? ""}${w.city && w.region ? `, ${w.region}` : ""}`;

function RunProgress({ board, pending }: { board: Board; pending: number }) {
  const total = Math.max(board.tasks.length, 1);
  const done = board.tasks.filter((t) => t.status === "done").length;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="notice info" style={{ display: "grid", gap: 8 }}>
      <div className="row between">
        <span><span className="dot run" /> <b>Run in progress</b> · {done}/{board.tasks.length} tasks done · {board.calls.length} Qloo calls{pending ? `, ${pending} in flight` : ""}</span>
        <span className="mono">{board.run.id}</span>
      </div>
      <div className="progress"><i style={{ width: `${Math.max(pct, 6)}%` }} /></div>
    </div>
  );
}

function Cite({ id, onCite, cite, prev = false }: { id?: string; onCite: (c: string) => void; cite?: string | null; prev?: boolean }) {
  if (!id) return null;
  return <button className={`cite${cite === id ? " sel" : ""}${prev ? " prev" : ""}`} title={prev ? "Show the Qloo call from the previous run" : "Show the Qloo call"} onClick={() => onCite(id)}>{prev ? "prev " : ""}{citeLabel(id)}</button>;
}

function Bar({ v }: { v: number }) {
  const w = Math.min(Math.abs(v), 1) * 50;
  return <div className="bar"><i className={v < 0 ? "neg" : ""} style={{ left: v < 0 ? `${50 - w}%` : "50%", width: `${w}%` }} /></div>;
}

/** Recommendation kinds as the package lists them; brands are co-marketing partners, never ad interests. */
const CREATOR_GROUPS: Array<[Creator["kind"][], string, string]> = [
  [["podcast"], "Podcasts", "podcasts"],
  [["tv_show"], "TV shows", "TV shows"],
  [["artist", "person"], "Artists", "artists"],
  [["brand"], "Brands to partner with", "brands"],
  [["place", "other"], "Other", "other"],
];
const pts = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)} pts`;

/** "vs last run" strip: momentum, both trends and the taste gap before → now, then what entered or left. */
function VsLastRun({ pkg, onCite, cite }: { pkg: AttackPackage; onCite: (c: string) => void; cite: string | null }) {
  const v = pkg.vsLastRun!;
  const cites = <span className="cites">{[...new Set(v.cite)].map((c) => <Cite key={c} id={c} onCite={onCite} cite={cite} prev={!c.includes(pkg.runId)} />)}</span>;
  const ch = v.changes;
  if (!ch) {
    return (
      <p className={`notice ${v.gainingOn ? "ok" : "warn"}`} style={{ margin: 0 }}>
        <span><b>vs last run:</b> {v.summary} {cites}</span>
      </p>
    );
  }
  const since = v.previousRunAt ? `since the run at ${v.previousRunAt.slice(0, 16).replace("T", " ")} UTC` : "since the last run";
  const noData = (entity: string) => pkg.trends.find((t) => t.entity === entity)?.points === 0;
  const moves = ([
    ["New gap tags", ch.gap.added],
    ["Gap tags gone", ch.gap.dropped],
    ["New recommendations", ch.creators.added],
    ["Recommendations gone", ch.creators.dropped],
    ["Metros into the top 5", ch.where.added],
    ["Metros out of the top 5", ch.where.dropped],
  ] as Array<[string, string[]]>).filter(([, xs]) => xs.length);
  const moved = ch.gap.moved.slice(0, 4).map((m) => `${m.label} ${m.change > 0 ? "+" : ""}${m.change.toFixed(2)}`);
  return (
    <div className={`notice ${v.gainingOn ? "ok" : "warn"}`} style={{ margin: 0, display: "grid", gap: 10 }} title={v.summary}>
      <span>
        <b>vs last run</b> {since}: {ch.unchanged ? "no change in trends, taste gap, recommendations or top metros." : `${pkg.brand.name} ${v.gainingOn ? "is gaining" : "is not gaining yet"}.`} {cites}
      </span>
      <div className="grid4">
        <div className="stat"><div className="k">Momentum</div><div className="v">{pts(ch.momentum.before)} → {pts(ch.momentum.now)}</div><div className="s">your trend minus theirs</div></div>
        {ch.trends.map((t) => (
          <div key={t.role} className="stat">
            <div className="k">{t.role === "brand" ? "Your trend" : "Their trend"}</div>
            <div className="v">{noData(t.entity) ? "no data" : `${t.prevChangePct !== undefined ? `${pct(t.prevChangePct)} → ` : ""}${pct(t.changePct)}`}</div>
            <div className="s ellipsis">{t.entity} · {t.prevChangePct === undefined ? "new series" : t.deltaPts ? pts(t.deltaPts) : "no move"}</div>
          </div>
        ))}
        <div className="stat"><div className="k">Taste gap</div><div className="v">{ch.gap.prevTotal.toFixed(2)} → {ch.gap.total.toFixed(2)}</div><div className="s">{ch.gap.change < 0 ? "narrower" : ch.gap.change > 0 ? "wider" : "same"}{ch.gap.moved.length ? ` · ${ch.gap.moved.length} tags moved` : ""}</div></div>
      </div>
      {(moves.length > 0 || moved.length > 0) && (
        <div className="small" style={{ display: "grid", gap: 2, color: "var(--text)" }}>
          {moves.map(([label, xs]) => <span key={label}><b>{label}:</b> {xs.slice(0, 6).join(", ")}{xs.length > 6 ? ` +${xs.length - 6} more` : ""}</span>)}
          {moved.length > 0 && <span><b>Gap tags moved:</b> {moved.join(", ")}</span>}
        </div>
      )}
    </div>
  );
}

function PackageCard({ pkg, copySource, onCite, cite }: { pkg: AttackPackage; copySource: string | null; onCite: (c: string) => void; cite: string | null }) {
  const cites = useMemo(() => Object.keys(pkg.citations).length, [pkg]);
  const named = pkg.where.filter((w) => !isNear(w));
  const otherAreas = pkg.where.length - named.length;
  const topAges = [...pkg.who.ages].sort((a, b) => b.share - a.share).filter((a) => a.share > 0).slice(0, 2).map((a) => a.band);
  const gender = pkg.who.female !== undefined && pkg.who.male !== undefined ? (pkg.who.female > pkg.who.male ? "women" : pkg.who.male > pkg.who.female ? "men" : "") : "";
  const topGap = [...pkg.gap].sort((a, b) => b.delta - a.delta)[0];
  const podcasts = pkg.creators.filter((c) => c.kind === "podcast").length;
  const creatorGroups = CREATOR_GROUPS.map(([kinds, label, short]) => ({ label, short, items: pkg.creators.filter((c) => kinds.includes(c.kind)) })).filter((g) => g.items.length);
  const gapMax = Math.max(1, ...pkg.gap.flatMap((g) => [g.theirs, g.yours]));
  const hooks = [...pkg.gap.map((g) => ({ label: g.label, cite: g.cite })), ...pkg.interests.map((i) => ({ label: i.name, cite: i.cite }))];
  const builtOn = (angle: string) => hooks.find((h) => h.label && angle.toLowerCase().includes(h.label.toLowerCase()));
  const comp = pkg.competitor.name;
  return (
    <article className="card pkg">
      <header className="pkg-head">
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow" style={{ margin: 0 }}>Attack package</p>
          <h2>{pkg.brand.name}<span className="vs">vs</span>{comp}</h2>
          <p className="small muted" style={{ margin: "2px 0 0" }}>Targets people like {comp}&apos;s customers · {cites} cited Qloo calls</p>
        </div>
        {pkg.vsLastRun ? (
          <span className={pkg.vsLastRun.gainingOn ? "badge ok" : "badge warn"}>{pkg.vsLastRun.gainingOn ? "▲ gaining" : "■ not gaining yet"}</span>
        ) : (
          <span className="badge">first run</span>
        )}
      </header>
      <div className="pkg-body">
        <div className="grid4">
          <div className="stat"><div className="k">Where</div><div className="v">{named.slice(0, 2).map((w) => w.city ?? w.region).join(", ") || "—"}</div><div className="s">{named.length > 2 ? `+${named.length - 2} more metros` : "top metros"}</div></div>
          <div className="stat"><div className="k">Who</div><div className="v">{[gender, topAges.join(", ")].filter(Boolean).join(" ") || "—"}</div><div className="s">over-indexed vs average</div></div>
          <div className="stat"><div className="k">Hook</div><div className="v">{topGap?.label ?? "—"}</div><div className="s">biggest taste gap</div></div>
          <div className="stat"><div className="k">Sponsor</div><div className="v">{podcasts ? `${podcasts} podcasts` : pkg.creators.length ? `${pkg.creators.length} creators` : "—"}</div><div className="s ellipsis">{creatorGroups.length > 1 ? `+ ${creatorGroups.slice(podcasts ? 1 : 0).map((g) => `${g.items.length} ${g.short}`).join(", ")}` : (pkg.creators[0]?.name ?? "")}</div></div>
        </div>

        {pkg.vsLastRun ? (
          <VsLastRun pkg={pkg} onCite={onCite} cite={cite} />
        ) : (
          <p className="small muted" style={{ margin: 0 }}>First run for this competitor: the next run is compared with this one and shows whether you are gaining.</p>
        )}

        <div className="pkg-section">
          <h3>What people like {comp}&apos;s customers love that yours don&apos;t</h3>
          <p className="sub">Qloo audience comparison: the switching hooks, strongest first. <span className="legend"><span><i style={{ background: "var(--theirs)" }} />{comp} fans</span><span><i style={{ background: "var(--yours)" }} />{pkg.brand.name} fans</span></span></p>
          {pkg.gap.length === 0 && <p className="small muted">No gap found in this run.</p>}
          {pkg.gap.map((g) => (
            <div key={g.label} className="gap-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 650 }}>{g.label}</div>
                {g.yours === 0 && <span className="badge plain xsmall absent">not in your audience&apos;s top tags</span>}
              </div>
              <div className="bars">
                <div><span>theirs</span><div className="meter theirs"><i style={{ width: `${(Math.max(g.theirs, 0) / gapMax) * 100}%` }} /></div><span className="v">{g.theirs.toFixed(2)}</span></div>
                {g.yours !== 0 && <div><span>yours</span><div className="meter yours"><i style={{ width: `${(Math.max(g.yours, 0) / gapMax) * 100}%` }} /></div><span className="v">{g.yours.toFixed(2)}</span></div>}
              </div>
              <Cite id={g.cite} onCite={onCite} cite={cite} />
            </div>
          ))}
        </div>

        <div className="grid3">
          <div className="pkg-section">
            <h3>Where</h3>
            <p className="sub">Metros where the audience is strongest, ranked by Qloo affinity</p>
            {named.slice(0, 6).map((w, i) => (
              <div key={i} className="mini-row" style={{ gridTemplateColumns: "18px minmax(0,1fr) auto" }}>
                <span className="faint mono">{i + 1}</span>
                <span className="ellipsis" title={`Qloo affinity ${w.score.toFixed(3)}`}>{placeLabel(w)}</span>
                <Cite id={w.cite} onCite={onCite} cite={cite} />
              </div>
            ))}
            {named.length === 0 && <p className="small muted">No named metros in this run.</p>}
            {(named.length > 6 || otherAreas > 0) && <p className="xsmall muted" style={{ marginTop: 6 }}>{named.length > 6 ? `+${named.length - 6} more metros` : ""}{named.length > 6 && otherAreas > 0 ? " · " : ""}{otherAreas > 0 ? `+${otherAreas} other areas (coordinates only)` : ""}</p>}
          </div>
          <div className="pkg-section">
            <h3>Who <Cite id={pkg.who.cite} onCite={onCite} cite={cite} /></h3>
            <p className="sub">Qloo affinity index (right of centre = over-indexed)</p>
            {pkg.who.ages.map((a) => <div key={a.band} className="who-row"><span>{a.band}</span><Bar v={a.share} /><span className="num">{a.share.toFixed(2)}</span></div>)}
            {pkg.who.female !== undefined && <div className="who-row"><span>women</span><Bar v={pkg.who.female} /><span className="num">{pkg.who.female.toFixed(2)}</span></div>}
            {pkg.who.male !== undefined && <div className="who-row"><span>men</span><Bar v={pkg.who.male} /><span className="num">{pkg.who.male.toFixed(2)}</span></div>}
          </div>
          <div className="pkg-section">
            <h3>Trends</h3>
            <p className="sub">Qloo trend data lags about 60 days</p>
            {pkg.trends.map((t, i) => (
              <div key={i} className="mini-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
                <span className="ellipsis">{t.entity}</span>
                {t.points === 0 ? (
                  <span className="badge plain">no Qloo trend data in window</span>
                ) : (
                  <span className={t.direction === "rising" ? "badge ok" : t.direction === "falling" ? "badge bad" : "badge"} title={t.points ? `${t.points} weekly points` : undefined}>{t.direction === "rising" ? "▲" : t.direction === "falling" ? "▼" : "●"} {t.direction}{t.changePct !== undefined ? ` ${pct(t.changePct)}` : ""}</span>
                )}
                <Cite id={t.cite} onCite={onCite} cite={cite} />
              </div>
            ))}
          </div>
        </div>

        <div className="grid2">
          <div className="stack">
            <div className="pkg-section">
              <h3>Interests to target</h3>
              <div className="chips">{pkg.interests.map((i) => <span key={i.name} className="chip">{i.name} <Cite id={i.cite} onCite={onCite} cite={cite} /></span>)}</div>
            </div>
            <div className="pkg-section">
              <h3>Sponsor and partner</h3>
              <p className="sub">Qloo recommendations for people like {comp}&apos;s customers</p>
              {creatorGroups.length === 0 && <p className="small muted">No recommendations in this run.</p>}
              {creatorGroups.map((g) => (
                <div key={g.label} style={{ marginBottom: 8 }}>
                  <div className="xsmall muted" style={{ marginBottom: 4 }}>{g.label}</div>
                  <div className="chips">{g.items.slice(0, 8).map((c) => <span key={c.name} className="chip">{c.name} <Cite id={c.cite} onCite={onCite} cite={cite} /></span>)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="pkg-section">
            <h3>Copy angles {copySource && <span className="badge plain" style={{ fontWeight: 500 }}>{copySource}</span>}</h3>
            <ul className="angles">
              {pkg.copyAngles.map((a) => {
                const b = builtOn(a);
                return (
                  <li key={a}>
                    {a}
                    {b && <div className="xsmall muted" style={{ marginTop: 4 }}>built on: {b.label} <Cite id={b.cite} onCite={onCite} cite={cite} /></div>}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </article>
  );
}

function Entities({ pid, brand, competitors, onChange, demo, children }: { pid: number; brand?: Entity; competitors: Entity[]; onChange: () => Promise<void>; demo: boolean; children?: React.ReactNode }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function add(role: "brand" | "competitor", n: string) {
    setBusy(true);
    setErr("");
    const r = await api(`/api/projects/${pid}/entities`, { body: { role, name: n } });
    setBusy(false);
    if (!r.ok) return setErr(r.data.error ?? "Could not add.");
    setName("");
    await onChange();
  }
  async function pick(e: Entity, candidateId: string) {
    const r = await api(`/api/projects/${pid}/entities/${e.id}`, { body: { candidateId } });
    if (!r.ok) setErr(r.data.error ?? "Could not pick.");
    await onChange();
  }
  async function remove(e: Entity) {
    await api(`/api/projects/${pid}/entities/${e.id}`, { method: "DELETE" });
    await onChange();
  }
  const row = (e: Entity) => (
    <div key={e.id} className="entity" style={{ alignItems: "flex-start" }}>
      <span className={`role ${e.role}`} style={{ marginTop: 2 }}>{e.role === "brand" ? "brand" : "vs"}</span>
      <div className="grow">
        <div className="row between" style={{ flexWrap: "nowrap" }}>
          <span className="name" style={{ minWidth: 0, overflowWrap: "anywhere" }}>{e.name}</span>
          <span className={statusBadge(e.status)}>{e.status === "found" ? "in Qloo" : e.status.replace("_", " ")}</span>
        </div>
        {e.status === "found" && e.qloo_name && e.qloo_name !== e.name && <div className="xsmall muted">Qloo: {e.qloo_name}</div>}
        {(e.status === "not_found" || e.status === "ambiguous") && (
          <div className="small" style={{ marginTop: 6 }}>
            <span className="err">{e.status === "not_found" ? `"${e.name}" was not found in Qloo.` : `"${e.name}" matches several Qloo entities.`}</span>
            {e.candidates && e.candidates.length > 0 ? (
              <div className="row" style={{ marginTop: 6 }}>
                <span className="muted">Did you mean:</span>
                {e.candidates.map((c) => <button key={c.id} className="btn secondary small" onClick={() => pick(e, c.id)}>{c.name}{c.type ? ` (${c.type.split(":").pop()})` : ""}</button>)}
              </div>
            ) : (
              <div className="muted">Small or local brands may not be in Qloo yet. Try a different spelling or a bigger competitor.</div>
            )}
          </div>
        )}
      </div>
      {e.role === "competitor" && !demo && <button className="btn danger small" onClick={() => remove(e)} aria-label={`Remove ${e.name}`}>Remove</button>}
    </div>
  );
  return (
    <section className="card" id="entities">
      <div className="card-head" style={{ marginBottom: 6 }}>
        <div>
          <h2>Brand and competitors</h2>
          <p className="card-sub">Each name is checked in Qloo when added.</p>
        </div>
      </div>
      <div>{brand && row(brand)}{competitors.map(row)}</div>
      {!demo && (
        <form className="inline-form" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) void add("competitor", name.trim()); }}>
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Add a competitor" aria-label="Competitor name" />
          <button className="btn secondary" disabled={busy || competitors.length >= 5}>{busy ? "Checking…" : "Add"}</button>
        </form>
      )}
      {err && <p className="err" style={{ marginTop: 6 }}>{err}</p>}
      {children}
    </section>
  );
}

function Landing({ pid, initial }: { pid: number; initial: string }) {
  const [url, setUrl] = useState(initial);
  const [msg, setMsg] = useState("");
  return (
    <form className="stack tight" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }} onSubmit={async (e) => {
      e.preventDefault();
      const r = await api(`/api/projects/${pid}`, { method: "PATCH", body: { landingUrl: url.trim() || null } });
      setMsg(r.ok ? "Saved: the ad templates link here." : (r.data.error ?? "Could not save."));
    }}>
      <label htmlFor={`landing-${pid}`}>Landing page for the ad templates</label>
      <div className="inline-form">
        <input id={`landing-${pid}`} type="url" maxLength={300} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.example.com/shoes" />
        <button className="btn secondary">Save</button>
      </div>
      {msg && <span className="small muted">{msg}</span>}
    </form>
  );
}

function Chat({ pid, initial, competitor }: { pid: number; initial: View["chat"]; competitor?: string }) {
  const [msgs, setMsgs] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const m = text.trim();
    if (!m) return;
    setBusy(true);
    setText("");
    setMsgs((x) => [...x, { id: Date.now(), role: "user", content: m, model: null }]);
    const r = await api<{ reply: string; model: string }>(`/api/projects/${pid}/chat`, { body: { message: m } });
    setBusy(false);
    setMsgs((x) => [...x, { id: Date.now() + 1, role: "assistant", content: r.ok ? r.data.reply : (r.data.error ?? "Error"), model: r.ok ? r.data.model : null }]);
  }
  const ideas = [`Where should I advertise against ${competitor ?? "my competitor"}?`, "What is the biggest taste gap?", "run now"];
  return (
    <section className="card stack" id="boss-chat">
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <span className="avatar boss" aria-hidden>B</span>
        <div>
          <h2 style={{ margin: 0 }}>Boss chat</h2>
          <p className="card-sub">Answers from the stored runs. Type &quot;run now&quot; to start a run.</p>
        </div>
      </div>
      <div className="chatlog" aria-live="polite">
        {msgs.length === 0 && <p className="small muted" style={{ margin: 0 }}>Ask about the latest run, for example:</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <span className={`avatar ${m.role === "user" ? "user" : "boss"}`} aria-hidden>{m.role === "user" ? "Y" : "B"}</span>
            <div style={{ minWidth: 0 }}>
              <div className="bubble">{m.content}</div>
              {m.role === "assistant" && m.model && <div className="xsmall faint" style={{ marginTop: 3 }}>{m.model}</div>}
            </div>
          </div>
        ))}
        {busy && <div className="msg"><span className="avatar boss" aria-hidden>B</span><div className="bubble muted">Thinking…</div></div>}
      </div>
      {msgs.length === 0 && <div className="suggest">{ideas.map((i) => <button key={i} type="button" onClick={() => setText(i)}>{i}</button>)}</div>}
      <form className="inline-form" onSubmit={send}>
        <input value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Ask the Boss…" aria-label="Message to the Boss" />
        <button className="btn" disabled={busy}>{busy ? "…" : "Send"}</button>
      </form>
    </section>
  );
}
