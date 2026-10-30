"use client";

import { useMemo, useState } from "react";
import type { Dashboard as Data } from "@/lib/campaign/dashboard";
import { fmtReach } from "@/lib/campaign/segments";
import { PLAT_LABEL } from "@/lib/campaign/plan";
import { creativeUrl } from "@/lib/ads/creative/formats";
import SiteForm from "@/components/core/SiteForm";
import RunAgain from "@/components/core/RunAgain";
import LogoutButton from "@/components/core/LogoutButton";

/**
 * "My campaigns" as an agency dashboard: what the agents did on Qloo this week, the rivals -> tastes -> cities flow behind the
 * campaigns, reach and age groups, a to-do list and upcoming retail dates, then every brand. Charts are plain SVG/CSS.
 */
const SLOTS = Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, "0")}:00`);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function BrandSelect({ id, brands, value, onChange, all = true }: { id: string; brands: Data["brands"]; value: string; onChange: (v: string) => void; all?: boolean }) {
  return (
    <select id={id} className="db-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Brand">
      {all && <option value="all">All brands</option>}
      {brands.map((b) => <option key={b.id} value={String(b.id)}>{b.brand} · {b.domain}</option>)}
    </select>
  );
}

function Bars({ title, sub, values, labels }: { title: string; sub: string; values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return (
    <section className="db-card db-bars">
      <h3>{title} <span>{sub}</span></h3>
      <div className="dbb">
        {values.map((v, i) => (
          <div key={i} className="dbb-col">
            <span className="dbb-v">{v}</span>
            <span className={`dbb-fill${v ? "" : " zero"}`} style={{ height: `${Math.max(6, (v / max) * 78)}%` }} />
            <span className="dbb-l">{labels[i]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Rivals -> tastes -> cities for one brand's running campaigns; box heights and ribbon widths share one scale (weekly reach). */
function Flow({ b }: { b: Data["brands"][number] }) {
  const items = b.plan?.items ?? [];
  if (!items.length) return <p className="db-empty">No finished run for {b.brand} yet.</p>;
  const W = 1000, H = 320, PAD = 10, GAP = 12, colX = [10, 290, 580, 860], nodeW = 130;
  const val = (c: (typeof items)[number]) => Math.max(1, c.reach);
  const total = items.reduce((a, c) => a + val(c), 0);
  const groups = [
    (_c: (typeof items)[number]) => b.brand,
    (c: (typeof items)[number]) => c.rival,
    (c: (typeof items)[number]) => `${c.rival}|${c.taste}`,
    (c: (typeof items)[number]) => c.city || "—",
  ];
  const sums = groups.map((g) => { const m = new Map<string, number>(); for (const c of items) m.set(g(c), (m.get(g(c)) ?? 0) + val(c)); return m; });
  // px per reach unit, the same in every column; shrunk until every column fits with each box at least MIN tall (room for a label).
  const MIN = 24;
  let k = (H - 2 * PAD) / total;
  for (let i = 0; i < 40; i++) {
    const over = Math.max(...sums.map((m) => [...m.values()].reduce((a, v) => a + Math.max(MIN, v * k), 0) + GAP * (m.size - 1)));
    if (over <= H - 2 * PAD) break;
    k *= 0.92;
  }
  // Lay out each column centred, with its leftover height spread as extra gaps.
  const pos = sums.map((m) => {
    const keys = [...m.keys()];
    const used = keys.reduce((a, key) => a + Math.max(MIN, m.get(key)! * k), 0);
    const gap = keys.length > 1 ? (H - 2 * PAD - used) / (keys.length - 1) : 0;
    let y = keys.length > 1 ? PAD : (H - used) / 2;
    const out = new Map<string, { y: number; h: number; v: number; outY: number; inY: number }>();
    for (const key of keys) {
      const h = Math.max(MIN, m.get(key)! * k);
      const flow = m.get(key)! * k; // ribbons fill the middle of a box that is taller than its flow
      const off = (h - flow) / 2;
      out.set(key, { y, h, v: m.get(key)!, outY: y + off, inY: y + off });
      y += h + gap;
    }
    return out;
  });
  const ribbons: Array<{ d: string; w: number; key: string }> = [];
  items.forEach((c, i) => {
    const w = val(c) * k;
    for (let col = 0; col < 3; col++) {
      const from = pos[col].get(groups[col](c))!, to = pos[col + 1].get(groups[col + 1](c))!;
      ribbons.push({ d: path(colX[col] + nodeW, from.outY + w / 2, colX[col + 1], to.inY + w / 2), w, key: `${i}-${col}` });
      from.outY += w;
      to.inY += w;
    }
  });
  const sub = ["", "fans", "Qloo taste", "Qloo heatmap"];
  return (
    <div className="db-flow-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="db-flow" role="img" aria-label={`How ${b.brand}'s campaigns come from its rivals' fans`}>
        {ribbons.map((r) => <path key={r.key} d={r.d} strokeWidth={Math.max(1.5, r.w)} className="rib" />)}
        {pos.map((m, col) => [...m].map(([key, p]) => {
          const label = col === 2 ? key.split("|")[1] : col === 1 ? `${key}'s fans` : key;
          const short = label.length > 18 ? `${label.slice(0, 17)}…` : label;
          const big = p.h >= 40;
          return (
            <g key={`${col}-${key}`}>
              <rect x={colX[col]} y={p.y} width={nodeW} height={p.h} rx={8} className={col === 0 ? "node hot" : "node"} />
              <text x={colX[col] + 10} y={big ? p.y + 17 : p.y + p.h / 2 + 4} className="nl">{short}</text>
              {big && <text x={colX[col] + 10} y={p.y + 31} className="ns">{col === 0 ? `${items.length} campaigns · ~${fmtReach(p.v)}/wk` : col === 1 ? `~${fmtReach(p.v)} people/wk` : sub[col]}</text>}
            </g>
          );
        }))}
      </svg>
    </div>
  );
}
function path(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

function Donut({ parts }: { parts: Array<{ label: string; n: number }> }) {
  const total = parts.reduce((a, p) => a + p.n, 0) || 1;
  let acc = 0;
  const R = 70, C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 180 180" className="db-donut" role="img" aria-label="Targeted age groups">
      <circle cx={90} cy={90} r={R} className="track" />
      {parts.map((p, i) => {
        const len = (p.n / total) * C;
        const el = <circle key={p.label} cx={90} cy={90} r={R} className={`seg s${i}`} strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} />;
        acc += len;
        return el;
      })}
      <text x={90} y={88} textAnchor="middle" className="dn">{total}</text>
      <text x={90} y={106} textAnchor="middle" className="ds">campaigns</text>
    </svg>
  );
}

export default function Dashboard({ data, email }: { data: Data; email: string }) {
  const [heatBrand, setHeatBrand] = useState("all");
  const ready = data.brands.filter((b) => b.plan);
  const [flowBrand, setFlowBrand] = useState(String(ready[0]?.id ?? ""));
  const flow = ready.find((b) => String(b.id) === flowBrand) ?? ready[0];
  const grid = data.heat[heatBrand] ?? data.days.map(() => SLOTS.map(() => 0));
  const hmax = Math.max(1, ...grid.flat());
  const items = ready.flatMap((b) => b.plan!.items);
  const ages = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of items) m.set(c.band, (m.get(c.band) ?? 0) + 1);
    return [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  }, [items]);
  const gender = { women: items.filter((c) => c.gender === "women").length, men: items.filter((c) => c.gender === "men").length };
  const plats = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of ready) for (const p of b.plan!.platforms) m.set(p, (m.get(p) ?? 0) + b.plan!.campaigns);
    return m;
  }, [ready]);
  const maxReach = Math.max(1, ...ready.map((b) => b.plan!.reach));
  const dayLabels = data.days.map((d) => d.label.slice(0, 3));

  return (
    <div className="db">
      <aside className="db-side">
        <a href="/campaigns" className="wz-logo"><span className="wz-mark">P</span>Poachly</a>
        <p className="db-navh">Navigation</p>
        <nav className="db-nav">
          <a className="on" href="/campaigns"><i>⌂</i>Home</a>
          {data.brands.slice(0, 8).map((b) => <a key={b.id} href={`/go/${b.id}`}><i>{b.brand.slice(0, 1)}</i><span className="ell">{b.brand}</span><small>{b.domain}</small></a>)}
        </nav>
        <p className="db-navh">Tools</p>
        <nav className="db-nav">
          <a href="/start"><i>+</i>Set up a new brand</a>
          <a href="#db-flow"><i>⇢</i>Fans to campaigns</a>
        </nav>
        <div className="db-side-foot">
          <a className="db-cta" href="/start">Start a new brand</a>
          <span className="ell">{email}</span>
          <LogoutButton />
        </div>
      </aside>

      <main className="db-main">
        <header className="db-hello">
          <h1>Welcome back.</h1>
          <p>Whose customers do you want next?</p>
          <SiteForm big={false} />
        </header>

        <section className="db-sec">
          <h2>Agent activity <span>on Qloo, this week</span></h2>
          <div className="db-card db-heatwrap">
            <div className="db-heat">
              <div className="db-tools"><BrandSelect id="db-heat-brand" brands={data.brands} value={heatBrand} onChange={setHeatBrand} /><span className="hint">Qloo calls per 2 hours (UTC)</span></div>
              <div className="hm" role="table" aria-label="Qloo calls by day and time">
                {data.days.map((d, i) => (
                  <div key={d.key} className="hm-row" role="row">
                    <span className="hm-day" role="rowheader">{d.label} <small>| {d.date}</small></span>
                    {grid[i].map((n, s) => <span key={s} role="cell" className={`hm-c${n ? " on" : ""}`} style={n ? { opacity: 0.35 + 0.65 * (n / hmax) } : undefined} title={`${d.label} ${SLOTS[s]}: ${n} Qloo call${n === 1 ? "" : "s"}`} />)}
                  </div>
                ))}
                <div className="hm-row hm-foot"><span className="hm-day" />{SLOTS.map((s, i) => <span key={s} className="hm-t">{s}<br />to {i === 11 ? "23:59" : SLOTS[i + 1]}</span>)}</div>
              </div>
            </div>
            <div className="db-log">
              <h3>Activity log <span>most recent</span></h3>
              {data.log.length ? data.log.slice(0, 6).map((l, i) => (
                <a key={i} className={`lg ${l.kind}`} href={`/go/${l.projectId}`}>
                  <i aria-hidden>{l.brand.slice(0, 1)}</i>
                  <span className="min0"><b>{l.brand}</b><small>{l.text} · {ago(l.at)}</small></span>
                  <span className="arr" aria-hidden>→</span>
                </a>
              )) : <p className="db-empty">No runs yet. Paste a website above.</p>}
              {data.log.length > 6 && <p className="more">and {data.log.length - 6} more.</p>}
            </div>
          </div>
        </section>

        <section className="db-sec db-three">
          <Bars title="Qloo calls" sub="by your agents" values={data.daily.calls} labels={dayLabels} />
          <Bars title="Runs" sub="started" values={data.daily.runs} labels={dayLabels} />
          <Bars title="Campaigns built" sub="by your agency" values={data.daily.segments} labels={dayLabels} />
        </section>

        {flow && (
          <section className="db-sec" id="db-flow">
            <h2>From rivals&apos; fans <span>to your campaigns</span></h2>
            <div className="db-card">
              <div className="db-tools"><BrandSelect id="db-flow-brand" brands={ready} value={String(flow.id)} onChange={setFlowBrand} all={false} /><span className="hint">brand → rival&apos;s fans → Qloo taste → city · width = weekly reach</span></div>
              <Flow b={flow} />
            </div>
          </section>
        )}

        <section className="db-sec db-two">
          <div>
            <h2>Reach <span>of your campaigns, per week</span></h2>
            <div className="db-card db-reach">
              {ready.length ? ready.slice(0, 6).map((b) => (
                <div key={b.id} className="rc">
                  <span className="v">~{fmtReach(b.plan!.reach)}</span>
                  <i style={{ height: `${Math.max(8, (b.plan!.reach / maxReach) * 100)}%` }} />
                  <b className="ell">{b.brand}</b>
                  <small>{b.plan!.campaigns} campaigns · ${b.plan!.budget}/day</small>
                </div>
              )) : <p className="db-empty">No campaigns yet.</p>}
            </div>
          </div>
          <div>
            <h2>Targeted age groups <span>from Qloo demographics</span></h2>
            <div className="db-card db-ages">
              <Donut parts={ages} />
              <ul>
                {ages.map((a, i) => <li key={a.label}><i className={`s${i}`} />{a.label}<b>{Math.round((a.n / Math.max(1, items.length)) * 100)}%</b><small>{a.n} campaigns</small></li>)}
                <li className="g">Women only on {gender.women} · Men only on {gender.men}</li>
                <li className="g">{[...plats].map(([p, n]) => `${PLAT_LABEL[p as keyof typeof PLAT_LABEL]} ${n}`).join(" · ") || "No platform on"}</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="db-sec db-two">
          <div>
            <h2>To-do list <span>for you</span></h2>
            <div className="db-card db-todo">
              {data.todo.map((t, i) => <a key={i} className={t.done ? "done" : ""} href={t.href}><i aria-hidden>{t.done ? "✓" : ""}</i>{t.text}</a>)}
            </div>
          </div>
          <div>
            <h2>Upcoming dates <span>worth a campaign</span></h2>
            <div className="db-card db-events">
              {data.events.map((e) => <p key={e.name}><b>{e.name}</b><small>{e.inDays === 0 ? "today" : `in ${e.inDays} day${e.inDays === 1 ? "" : "s"}`} | {new Date(e.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</small></p>)}
            </div>
          </div>
        </section>

        <section className="db-sec">
          <h2>Your brands <span>{data.brands.length}</span></h2>
          <div className="mc-grid">
            {data.brands.map((p) => {
              const running = p.status === "running" || p.status === "queued";
              const chip = running ? ["run", "Agents working"] : p.status === "failed" ? ["bad", "Run stopped"] : !p.plan ? ["", "Not run yet"] : p.plan.launched ? ["ok", "Ready to launch · preview"] : ["", "Draft"];
              return (
                <article key={p.id} className="mc-card">
                  <header>
                    <span className="wz-fav">{p.brand.slice(0, 1).toUpperCase()}</span>
                    <span className="mc-min"><b className="ell">{p.brand}</b><small className="ell">{p.domain}{p.rivals.length ? ` · vs ${list(p.rivals)}` : ""}</small></span>
                    <span className={`mc-chip ${chip[0]}`}>{running && <i className="spin" />}{chip[1]}</span>
                  </header>
                  {p.plan ? (
                    <div className="mc-thumbs">
                      {p.plan.thumbs.map((t) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={t.n} src={creativeUrl(p.id, t.n, "sq", t.v)} alt="" loading="lazy" />
                      ))}
                    </div>
                  ) : <p className="mc-empty">{running ? "The agents are profiling the rivals' fans on Qloo…" : "No finished run yet."}</p>}
                  <footer>
                    <span className="mc-when">{p.plan ? `${p.plan.campaigns} campaigns · $${p.plan.budget}/day · ~${fmtReach(p.plan.reach)}/wk` : ""}<br />Last run {ago(p.at)}</span>
                    <a className="mc-btn ghost" href={`/start?site=${encodeURIComponent(p.domain)}&brand=${p.id}`}>Add or change rivals</a>
                    <RunAgain projectId={p.id} running={running} />
                    <a className="mc-btn" href={`/go/${p.id}`}>Open →</a>
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
