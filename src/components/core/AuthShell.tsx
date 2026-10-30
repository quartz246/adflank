import Link from "next/link";
import TopBar from "./TopBar";
import DemoButton from "./DemoButton";
import { demoEnabled } from "@/lib/demo";

/** Two-column auth layout: what you get on the left, the form on the right. */
export default function AuthShell({ mode, children }: { mode: "login" | "signup"; children: React.ReactNode }) {
  return (
    <>
      <TopBar>
        {mode === "login" ? <Link className="btn secondary small" href="/signup">Sign up free</Link> : <Link className="navlink" href="/login">Log in</Link>}
      </TopBar>
      <div className="auth">
        <aside className="auth-side">
          <p className="eyebrow" style={{ color: "#c4b5fd" }}>Poachly</p>
          <h2>Your agent team for winning a competitor&apos;s customers.</h2>
          <ul>
            <li>Live Qloo taste data, every claim cited</li>
            <li>Runs daily and compares with the last run</li>
            <li>Meta, TikTok and Google Ads templates, ready to import</li>
          </ul>
        </aside>
        <main className="auth-main">
          <div className="auth-card stack">
            {children}
            {demoEnabled() && (
              <>
                <div className="or">or</div>
                <DemoButton className="btn secondary" />
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
