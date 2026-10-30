import { redirect } from "next/navigation";
import { currentUser, isGuestUser } from "@/lib/auth/session";
import { entities, projects, runs } from "@/lib/db/repo";
import SiteForm from "@/components/core/SiteForm";
import LogoutButton from "@/components/core/LogoutButton";
import "@/components/wizard/wizard.css";

export const dynamic = "force-dynamic";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const STATUS: Record<string, string> = { done: "ready", running: "running", queued: "running", failed: "stopped" };

/** Signed-in home: the same website box as the landing page, and the user's saved searches under it. */
export default async function ProjectsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (isGuestUser(user)) redirect("/signup");
  const list = projects.forUser(user.id).map((p) => {
    const last = runs.lastForProject(p.id);
    const rivals = entities.forProject(p.id).filter((e) => e.role === "competitor" && e.status === "found").map((e) => e.name);
    return { id: p.id, name: p.name, rivals, status: last?.status, at: last?.started_at ?? p.created_at };
  });
  return (
    <div className="wz home acct">
      <header className="wz-top">
        <a href="/projects" className="wz-logo"><span className="wz-mark">A</span>AdFlank</a>
        <nav className="wz-top-r">
          <span className="acct-email">{user.email}</span>
          <LogoutButton />
        </nav>
      </header>
      <main className="home-main acct-main">
        <h1>Whose customers do you want next?</h1>
        <SiteForm />
        {list.length > 0 && (
          <section className="acct-list">
            <p className="wz-eyebrow">Your searches</p>
            {list.map((p) => (
              <a key={p.id} className="acct-row" href={`/go/${p.id}`}>
                <span className="wz-fav sm">{p.name.slice(0, 1).toUpperCase()}</span>
                <span className="min0">
                  <b className="ell">{p.name}</b>
                  <span className="muted small ell">{p.rivals.length ? `vs ${p.rivals.join(", ")}` : "no competitors yet"}</span>
                </span>
                <span className={`acct-st ${p.status ?? ""}`}>{p.status ? (STATUS[p.status] ?? p.status) : "not run"}</span>
                <span className="muted small acct-at">{ago(p.at)}</span>
              </a>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
