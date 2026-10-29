import Link from "next/link";
import { currentUser } from "@/lib/auth/session";
import DemoButton from "@/components/core/DemoButton";
import TopBar from "@/components/core/TopBar";
import { demoEnabled } from "@/lib/demo";

export const dynamic = "force-dynamic";

const TEAM = [
  { role: "boss", letter: "B", name: "Boss", text: "Runs the schedule, answers your questions from the stored runs and starts a new run when you ask." },
  { role: "planner", letter: "P", name: "Planner", text: "Plans today's research: which Qloo calls each competitor needs and in what market." },
  { role: "worker", letter: "W", name: "Workers", text: "One per competitor. Each calls Qloo through a fixed allowlist of tools; nothing else can run." },
  { role: "composer", letter: "C", name: "Composer", text: "Builds the cited attack package and the Meta, TikTok and Google Ads templates." },
] as const;

const STEPS = [
  { n: 1, color: "var(--worker)", title: "Watch", text: "Trends for your brand and each competitor, and the cities where each competitor's audience is strongest.", tools: "trends · where_popular" },
  { n: 2, color: "var(--planner)", title: "Profile", text: "Age and gender skew, the taste tags that define them, and the podcasts and brands they like.", tools: "demographics · entity_tags · recommend" },
  { n: 3, color: "var(--theirs)", title: "Find the gap", text: "What people like your competitor's customers love that your fans don't. That is the switching hook.", tools: "compare_audiences" },
  { n: 4, color: "var(--composer)", title: "Attack and measure", text: "Platform-ready ad templates per competitor, and every run compared with the last one.", tools: "vs last run" },
] as const;

const VS = [
  ["Live Qloo numbers, each claim cited", "Guesses from training data", "Every number links to the Qloo call it came from"],
  ["Runs on a schedule", "Only when you ask", "The team runs daily without being asked"],
  ["Remembers the last run", "Starts from zero", "Shows whether you are gaining on each competitor"],
  ["Finished platform templates", "Advice to copy and paste", "Meta, TikTok and Google Ads formats, limits checked, CSV/JSON export"],
  ["Knows when data is missing", "Answers anyway", "Checks each competitor in Qloo and tells you if it isn't there"],
] as const;

export default async function Landing() {
  const user = await currentUser();
  const demo = demoEnabled();
  return (
    <>
      <TopBar>
        {user ? (
          <Link className="btn" href="/projects">Open your projects</Link>
        ) : (
          <>
            <a className="navlink hide-sm" href="#how">How it works</a>
            <Link className="navlink" href="/login">Log in</Link>
            <Link className="btn secondary small" href="/signup">Sign up free</Link>
          </>
        )}
      </TopBar>
      <main className="wrap">
        <section className="hero">
          <div>
            <span className="pill"><b>QLOO</b> An agent team for conquest campaigns</span>
            <h1>Win your competitors&apos; customers <span className="hl">with live taste data.</span></h1>
            <p className="lede">
              Add your brand and your competitors once. Every day AdFlank&apos;s agents read Qloo&apos;s taste graph, find what people like
              your competitor&apos;s customers love that your fans don&apos;t, and hand you finished Meta, TikTok and Google Ads templates.
            </p>
            <div className="cta">
              {demo ? <DemoButton /> : null}
              <Link className={demo ? "btn secondary large" : "btn large glow"} href={user ? "/projects" : "/signup"}>
                {user ? "Open your projects" : "Start a project free"}
              </Link>
            </div>
            <p className="fine"><span>No signup for the demo</span><span>Every claim cites a Qloo call</span><span>Nothing is published without you</span></p>
            <p className="small muted" style={{ marginTop: 18 }}>For DTC brand marketers and the agencies that run their paid social and search.</p>
          </div>
          <HeroPreview />
        </section>

        <section className="section" id="how">
          <div className="head">
            <p className="eyebrow">How it works</p>
            <h2>From a competitor&apos;s name to a paused campaign</h2>
            <p>Each run makes real Qloo calls, cites them, and turns the result into an attack package per competitor.</p>
          </div>
          <div className="grid4 features">
            {STEPS.map((s) => (
              <div key={s.n} className="card feature">
                <div className="num" style={{ background: s.color }}>{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <p className="mono faint" style={{ marginTop: 10 }}>{s.tools}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="head">
            <p className="eyebrow">The team</p>
            <h2>Four agents, one job: take share from a competitor</h2>
            <p>You watch them work on a live board: the Planner&apos;s tasks, each Worker&apos;s Qloo calls and the packages they produce.</p>
          </div>
          <div className="grid4 features">
            {TEAM.map((t) => (
              <div key={t.role} className="card feature">
                <div className="row" style={{ marginBottom: 10 }}>
                  <span className={`avatar ${t.role}`} aria-hidden>{t.letter}</span>
                  <span className={`role ${t.role}`}>{t.name}</span>
                </div>
                <p>{t.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="head">
            <p className="eyebrow">Why not just ask a chatbot?</p>
            <h2>A chat window can&apos;t do this</h2>
          </div>
          <div className="card pad-0 table-wrap">
            <table className="vs-table">
              <thead><tr><th /><th>A chat window</th><th>AdFlank</th></tr></thead>
              <tbody>
                {VS.map(([k, chat, us]) => (
                  <tr key={k}><td>{k}</td><td className="no">{chat}</td><td className="yes">{us}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            Qloo provides aggregate audience taste, never customer names or emails: AdFlank targets people like a competitor&apos;s customers.
          </p>
        </section>

        <section className="cta-band">
          <div>
            <h2>See a finished run in one click</h2>
            <p>The demo project pits Allbirds against Nike and Adidas: live board, cited attack packages and all three ad templates.</p>
          </div>
          <div className="row">
            {demo && <DemoButton className="btn large" />}
            {!user && <Link className="btn ghost large" href="/signup">Create an account</Link>}
          </div>
        </section>

        <footer className="footer">
          <span>AdFlank · built on the Qloo Taste AI API</span>
          <span>Nothing is sent to ad platforms: publishing is a labelled preview.</span>
        </footer>
      </main>
    </>
  );
}

/** A static, clearly labelled illustration of the product (no real data). */
function HeroPreview() {
  return (
    <div className="preview" aria-label="Example of an AdFlank project (illustration)">
      <div className="preview-bar"><i /><i /><i /><span>Illustration · your brand vs a competitor</span></div>
      <div className="preview-body">
        <div className="row between">
          <strong>Live board</strong>
          <span className="badge run"><span className="dot run" /> running</span>
        </div>
        <div className="feed-item"><span className="avatar planner">P</span><span className="grow">Plan today&apos;s research</span><span className="badge ok">done</span></div>
        <div className="feed-item"><span className="avatar worker">W</span><span className="grow">qloo_where_popular <span className="faint">· Competitor</span></span><span className="cite">q2</span></div>
        <div className="feed-item"><span className="avatar worker">W</span><span className="grow">qloo_compare_audiences <span className="faint">· Competitor</span></span><span className="cite">q6</span></div>
        <div className="card flat" style={{ padding: 14 }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <strong>The gap</strong>
            <span className="legend"><span><i style={{ background: "var(--theirs)" }} />theirs</span><span><i style={{ background: "var(--yours)" }} />yours</span></span>
          </div>
          {[["Trail running", 92, 18], ["Indie podcasts", 74, 30], ["Minimalist design", 61, 12]].map(([k, a, b]) => (
            <div key={k} className="gap-row" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)" }}>
              <span className="small">{k}</span>
              <div className="bars">
                <div style={{ gridTemplateColumns: "minmax(0,1fr)" }}><div className="meter theirs"><i style={{ width: `${a}%` }} /></div></div>
                <div style={{ gridTemplateColumns: "minmax(0,1fr)" }}><div className="meter yours"><i style={{ width: `${b}%` }} /></div></div>
              </div>
            </div>
          ))}
        </div>
        <div className="row between">
          <span className="small muted">Templates ready</span>
          <span className="row"><span className="badge brandb">Meta</span><span className="badge brandb">TikTok</span><span className="badge brandb">Google Ads</span></span>
        </div>
      </div>
    </div>
  );
}
