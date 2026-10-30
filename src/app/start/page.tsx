import Link from "next/link";
import { currentUser, isGuestUser } from "@/lib/auth/session";
import { COUNTRY_CODES, countryName } from "@/lib/geo/cities";
import { entities, projects } from "@/lib/db/repo";
import Onboarding from "@/components/onboard/Onboarding";
import "@/components/wizard/wizard.css";
import "./onboard.css";

export const dynamic = "force-dynamic";

/** Step-by-step setup: pick the rivals from Qloo, the market and the ad plan before the agents start. Public, like the landing. */
export default async function StartPage({ searchParams }: { searchParams: Promise<{ site?: string; brand?: string }> }) {
  const user = await currentUser();
  const member = user && !isGuestUser(user);
  const sp = await searchParams;
  const site = (sp.site ?? "").slice(0, 200);
  // "Add or change rivals" for one of the owner's brands: start with its current rivals ticked.
  const own = user && sp.brand ? projects.owned(Number(sp.brand), user.id) : undefined;
  const current = own ? entities.forProject(own.id).filter((e) => e.role === "competitor" && e.status === "found" && e.qloo_id).map((e) => ({ id: e.qloo_id!, name: e.qloo_name ?? e.name })) : [];
  const countries = COUNTRY_CODES.map((code) => ({ code, name: countryName(code) ?? code })).sort((a, b) => (a.code === "US" ? -1 : b.code === "US" ? 1 : a.name.localeCompare(b.name)));
  return (
    <div className="wz ob">
      <header className="wz-top">
        <a href="/" className="wz-logo"><span className="wz-mark">P</span>Poachly</a>
        <nav className="wz-top-r">{member ? <Link className="wz-acct" href="/campaigns">My campaigns</Link> : <Link className="wz-acct" href="/login">Log in</Link>}</nav>
      </header>
      <main className="ob-wrap">
        <Onboarding countries={countries} initialSite={site} current={current} country={own?.country_code ?? "US"} />
      </main>
    </div>
  );
}
