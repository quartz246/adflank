import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { entities, projects, runs } from "@/lib/db/repo";
import { COUNTRY_CODES, countryName } from "@/lib/geo/cities";
import NewProjectForm from "@/components/core/NewProjectForm";
import DemoButton from "@/components/core/DemoButton";
import { demoEnabled, isDemoUser } from "@/lib/demo";

export const dynamic = "force-dynamic";

const runBadge = (s: string) => (s === "done" ? "badge ok" : s === "running" || s === "queued" ? "badge run" : s === "failed" ? "badge bad" : "badge warn");

export default async function ProjectsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const list = projects.forUser(user.id);
  const countries = COUNTRY_CODES.map((code) => ({ code, name: countryName(code)! })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="stack loose">
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="muted" style={{ margin: 0 }}>One project per brand. The agent team runs each one daily against its competitors.</p>
        </div>
      </div>
      <div className="split">
        <section className="stack">
          {list.length === 0 && (
            <div className="empty">
              <div className="icon" aria-hidden>+</div>
              <h3>No projects yet</h3>
              <p className="small" style={{ maxWidth: 420, margin: "0 auto 14px" }}>
                Add your brand and up to five competitors on the right. AdFlank checks each name in Qloo, then the team runs its first
                research pass.
              </p>
              {demoEnabled() && !isDemoUser(user) && <div className="row" style={{ justifyContent: "center" }}><DemoButton className="btn secondary" label="Or open the demo project" /></div>}
            </div>
          )}
          {list.map((p) => {
            const ents = entities.forProject(p.id);
            const brand = ents.find((e) => e.role === "brand");
            const comps = ents.filter((e) => e.role === "competitor");
            const last = runs.lastForProject(p.id);
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="card project-card">
                <div className="row between">
                  <h3>{p.name}</h3>
                  {last ? <span className={runBadge(last.status)}>{last.status === "done" ? "last run done" : last.status}</span> : <span className="badge">no runs yet</span>}
                </div>
                <div className="chips">
                  {brand && <span className="chip noncite"><span className="role brand">brand</span>{brand.name}</span>}
                  {comps.map((c) => <span key={c.id} className="chip noncite"><span className="role competitor">vs</span>{c.name}</span>)}
                </div>
                <div className="meta">
                  <span>{p.city ? `${p.city}, ` : ""}{countryName(p.country_code) ?? p.country_code}</span>
                  <span>Daily run {p.schedule_daily ? "on" : "off"}</span>
                  <span>{last ? `Last run ${new Date(last.started_at).toUTCString().slice(5, 22)} UTC` : "Run it from the project page"}</span>
                </div>
              </Link>
            );
          })}
        </section>
        <aside className="sticky"><NewProjectForm countries={countries} /></aside>
      </div>
    </div>
  );
}
