import { redirect } from "next/navigation";
import { currentUser, isGuestUser } from "@/lib/auth/session";
import { projects } from "@/lib/db/repo";
import { projectSummary } from "@/lib/campaign/summary";
import { fmtReach } from "@/lib/campaign/segments";
import { PLAT_LABEL } from "@/lib/campaign/plan";
import { creativeUrl } from "@/lib/ads/creative/formats";
import SiteForm from "@/components/core/SiteForm";
import LogoutButton from "@/components/core/LogoutButton";
import RunAgain from "@/components/core/RunAgain";
import "@/components/wizard/wizard.css";
import "./campaigns.css";

export const dynamic = "force-dynamic";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const day = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return new Date((Number.isFinite(t) ? t : Date.now()) + 86_400_000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Signed-in home: every brand's campaigns, the totals across them, and the website box to start on a new rival. */
export default async function CampaignsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (isGuestUser(user)) redirect("/signup");
  const all = projects.forUser(user.id).map(projectSummary);
  const ready = all.filter((p) => p.plan);
  const sum = (f: (p: (typeof ready)[number]) => number) => ready.reduce((a, p) => a + f(p), 0);
  const cities = new Set(ready.flatMap((p) => p.plan!.cities)).size;

  return (
    <div className="wz mc">
      <header className="wz-top">
        <a href="/campaigns" className="wz-logo"><span className="wz-mark">P</span>Poachly</a>
        <nav className="wz-top-r">
          <span className="mc-nav on">My campaigns</span>
          <span className="acct-email">{user.email}</span>
          <LogoutButton />
        </nav>
      </header>

      <main className="mc-main">
        <section className="mc-hero">
          <div className="mc-min">
            <p className="mc-eyebrow"><i />Your agency is working</p>
            <h1>Whose customers do you want next?</h1>
            <p className="mc-sub">Paste a website and the agents start on a new rival: Qloo profiles its fans, and you get a campaign for every segment.</p>
          </div>
          <SiteForm big={false} />
        </section>

        {all.length > 0 && (
          <section className="mc-kpis" aria-label="Across all your brands">
            <div><b>{all.length}</b><span>brand{all.length === 1 ? "" : "s"}</span></div>
            <div><b>{sum((p) => p.plan!.campaigns)}</b><span>campaigns planned</span></div>
            <div><b>${sum((p) => p.plan!.budget).toLocaleString("en-US")}</b><span>daily budget</span></div>
            <div><b>~{fmtReach(sum((p) => p.plan!.reach))}</b><span>people a week (est.)</span></div>
            <div><b>{cities}</b><span>cities targeted</span></div>
            <div><b>{sum((p) => p.plan!.qloo)}</b><span>cited Qloo calls</span></div>
          </section>
        )}

        <section className="mc-grid" aria-label="Your brands">
          {all.map((p) => {
            const running = p.status === "running" || p.status === "queued";
            const chip = running ? ["run", "Agents working"] : p.status === "failed" ? ["bad", "Run stopped"] : !p.plan ? ["", "Not run yet"] : p.plan.launched ? ["ok", "Ready to launch · preview"] : ["", "Draft"];
            return (
              <article key={p.id} className="mc-card">
                <header>
                  <span className="wz-fav">{p.brand.slice(0, 1).toUpperCase()}</span>
                  <span className="mc-min">
                    <b className="ell">{p.brand}</b>
                    <small className="ell">{p.domain}{p.rivals.length ? ` · vs ${list(p.rivals)}` : ""}</small>
                  </span>
                  <span className={`mc-chip ${chip[0]}`}>{running && <i className="spin" />}{chip[1]}</span>
                </header>
                {p.plan ? (
                  <>
                    <div className="mc-thumbs">
                      {p.plan.thumbs.map((t) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={t.n} src={creativeUrl(p.id, t.n, "sq", t.v)} alt="" loading="lazy" />
                      ))}
                    </div>
                    <div className="mc-stats">
                      <div><b>{p.plan.campaigns}</b><span>campaigns</span></div>
                      <div><b>${p.plan.budget.toLocaleString("en-US")}</b><span>a day</span></div>
                      <div><b>~{fmtReach(p.plan.reach)}</b><span>people / week</span></div>
                      <div><b>{p.plan.cities.length}</b><span>cities</span></div>
                    </div>
                    <p className="mc-tags">
                      {p.plan.tastes.map((t) => <span key={t}>{t}</span>)}
                      {p.plan.platforms.map((x) => <span key={x} className="plat">{PLAT_LABEL[x]}</span>)}
                    </p>
                  </>
                ) : (
                  <p className="mc-empty">{running ? "The agents are profiling the rivals' fans on Qloo…" : "No finished run yet."}</p>
                )}
                <footer>
                  <span className="mc-when">
                    Last run {ago(p.at)}
                    <br />
                    {p.scheduled ? <>Next daily check {day(p.plan?.finishedAt ?? null)}</> : "Daily runs off"}
                  </span>
                  <RunAgain projectId={p.id} running={running} />
                  <a className="mc-btn" href={`/go/${p.id}`}>Open campaigns →</a>
                </footer>
              </article>
            );
          })}
        </section>
        {all.length === 0 && <p className="mc-none">No brands yet. Paste a website above and the agents get to work.</p>}
      </main>
    </div>
  );
}
