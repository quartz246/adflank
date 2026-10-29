import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { packages, projects } from "@/lib/db/repo";
import type { AttackPackage, PlatformTemplate } from "@/lib/types/attack";
import { generateTemplates } from "@/lib/ads";
import AdsPanel from "@/components/ads/AdsPanel";
import { sanitizeDeep } from "@/lib/util/sanitize";

export const dynamic = "force-dynamic";

/** Ad templates for the latest completed run: one AdsPanel per competitor package (core page; ads module renders). */
export default async function AdsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? projects.owned(id, user.id) : undefined;
  if (!p) notFound();
  const pkgs = packages.latest(p.id).map((r) => sanitizeDeep(JSON.parse(r.package_json) as AttackPackage));
  const items: Array<{ pkg: AttackPackage; templates: PlatformTemplate[]; error?: string }> = pkgs.map((pkg) => {
    try {
      return { pkg, templates: generateTemplates(pkg, p.landing_url ? { landingUrl: p.landing_url } : {}) };
    } catch {
      return { pkg, templates: [], error: "The template builder could not process this package." };
    }
  });
  return (
    <div className="stack loose">
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="crumbs"><Link href="/projects">Projects</Link> / <Link href={`/projects/${p.id}`}>{p.name}</Link> / Ad templates</div>
          <h1>Ad templates</h1>
          <p className="muted" style={{ margin: 0 }}>Meta, TikTok and Google Ads campaigns built from the latest attack packages, one set per competitor.</p>
        </div>
        <Link className="btn secondary" href={`/projects/${p.id}`}>Back to the board</Link>
      </div>
      <p className="notice info" style={{ margin: 0 }}>
        <span><b>Nothing is published.</b> Each template is ready to download, or to publish once a platform is connected (publishing is a labelled stub during the hackathon).</span>
      </p>
      {items.length === 0 && (
        <div className="empty">
          <div className="icon" aria-hidden>◎</div>
          <h3>No completed run yet</h3>
          <p className="small" style={{ margin: "0 auto 12px", maxWidth: 420 }}>Run the team first: templates are built from its attack packages.</p>
          <Link className="btn" href={`/projects/${p.id}`}>Go to the board</Link>
        </div>
      )}
      {items.map(({ pkg, templates, error }) =>
        error ? (
          <section key={pkg.competitor.name} className="card stack">
            <h2>vs {pkg.competitor.name}</h2>
            <p className="notice bad" style={{ margin: 0 }}>{error}</p>
          </section>
        ) : (
          <AdsPanel key={pkg.competitor.name} pkg={pkg} templates={templates} connectFrom={`/projects/${p.id}/ads`} />
        ),
      )}
    </div>
  );
}
