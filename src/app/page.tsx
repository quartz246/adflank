import Link from "next/link";
import { currentUser, isGuestUser } from "@/lib/auth/session";
import SiteForm from "@/components/core/SiteForm";
import LogoutButton from "@/components/core/LogoutButton";
import HomeSteps from "@/components/core/HomeSteps";
import "@/components/wizard/wizard.css";

export const dynamic = "force-dynamic";

/** Home: one screen. Paste a website; the agency's steps run live on the next page. */
export default async function Landing() {
  const user = await currentUser();
  const member = user && !isGuestUser(user);
  return (
    <div className="wz home">
      <header className="wz-top">
        <a href="/" className="wz-logo"><span className="wz-mark">A</span>AdFlank</a>
        <nav className="wz-top-r">
          {member ? (
            <LogoutButton />
          ) : (
            <>
              <Link className="home-link" href="/login">Log in</Link>
              <Link className="wz-btn ghost sm" href="/signup">Sign up</Link>
            </>
          )}
        </nav>
      </header>

      <main className="home-main">
        <h1>Get an ad agency that works non-stop to win your competitors&apos; customers.</h1>
        <p className="home-sub">Paste your website. AdFlank&apos;s agents profile your rivals&apos; fans on Qloo&apos;s taste graph, design a campaign for every segment on Meta, TikTok and Google, and keep fighting for those customers every day.</p>
        <SiteForm />
        <div className="home-roles" aria-label="What it replaces">
          <span className="lab">Qloo&apos;s taste graph does the research. Your AdFlank agency is the</span>
          {["Media planner", "Copywriter", "Ad designer", "Campaign manager"].map((r) => <span key={r} className="role">{r}</span>)}
        </div>
        <HomeSteps />
      </main>

      <footer className="home-foot">Built on the Qloo Taste AI API · nothing is published to ad platforms without you</footer>
    </div>
  );
}
