import type { AdPlatform } from "@/lib/types/attack";
import { PLATFORM_LABEL } from "@/lib/ads/platforms";
import { button, ui } from "./styles";

interface Scope { scope: string; why: string }

/** The real OAuth endpoints and scopes the connection will request (shown, never called). */
export const CONNECT_SPEC: Record<AdPlatform, { authorize: string; scopes: Scope[]; note: string }> = {
  meta: {
    authorize: "https://www.facebook.com/dialog/oauth",
    scopes: [
      { scope: "ads_management", why: "Create the paused campaign, ad set and ad from your template." },
      { scope: "ads_read", why: "Read delivery results so next week's run can compare." },
      { scope: "business_management", why: "List the ad accounts and Pages your business owns." },
    ],
    note: "Facebook Login for Business, Marketing API.",
  },
  tiktok: {
    authorize: "https://business-api.tiktok.com/portal/auth",
    scopes: [
      { scope: "Ad Account Management", why: "List the advertiser accounts you authorise." },
      { scope: "Ads Management", why: "Create the disabled campaign, ad group and ad." },
      { scope: "Audience Management", why: "Look up interest and behavior targeting ids." },
      { scope: "Creative Management", why: "Upload the video made from the creative brief." },
      { scope: "Reporting", why: "Read results so next week's run can compare." },
    ],
    note: "TikTok Business API advertiser authorization (scopes are the permission groups set on the developer app).",
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: [
      { scope: "https://www.googleapis.com/auth/adwords", why: "Manage your Google Ads campaigns: create the paused Search campaign, ad group, keywords and Responsive Search Ad." },
    ],
    note: "Google Ads API (OAuth 2.0, offline access).",
  },
};

/** Mock OAuth consent screen: a preview of the connection being implemented. Nothing is sent. */
export default function ConnectConsent({ platform, backHref }: { platform: AdPlatform; backHref: string }) {
  const label = PLATFORM_LABEL[platform];
  const spec = CONNECT_SPEC[platform];
  return (
    <main style={{ fontFamily: ui.font, color: ui.ink, background: "transparent", minHeight: "100%", padding: "16px 0" }}>
      <div role="note" style={{ maxWidth: 520, margin: "0 auto 16px", background: ui.warnBg, color: ui.warn, border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", fontSize: 14 }}>
        <strong>Preview of the connection being implemented.</strong> No account is connected and nothing is sent to {label}.
        Publishing launches after the hackathon.
      </div>
      <section aria-label={`Connect ${label} Ads`} style={{ maxWidth: 520, margin: "0 auto", background: "#fff", border: `1px solid ${ui.line}`, borderRadius: 14, padding: 24, boxShadow: "0 4px 16px rgba(0,0,0,.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span aria-hidden style={{ width: 36, height: 36, borderRadius: 8, background: ui.brandGradient, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800 }}>A</span>
          <span aria-hidden style={{ color: ui.muted }}>⇄</span>
          <span aria-hidden style={{ width: 36, height: 36, borderRadius: 8, background: "#111827", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800 }}>{label.slice(0, 1)}</span>
        </div>
        <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Poachly wants to access your {label} Ads account</h1>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: ui.muted }}>
          So it can publish the templates it builds to reach people like your competitors&apos; customers. Everything is created paused.
        </p>
        <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Permissions requested</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "grid", gap: 8 }}>
          {spec.scopes.map((s) => (
            <li key={s.scope} style={{ border: `1px solid ${ui.line}`, borderRadius: 8, padding: "8px 10px" }}>
              <code style={{ fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>{s.scope}</code>
              <div style={{ fontSize: 13, color: ui.muted }}>{s.why}</div>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 12, color: ui.muted, margin: "0 0 16px", overflowWrap: "anywhere" }}>
          {spec.note} Authorization endpoint: <code>{spec.authorize}</code>
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <a href={backHref} style={button()}>Back to templates</a>
          <button type="button" disabled style={{ ...button(true), opacity: 0.55, cursor: "not-allowed" }} title="Available after the hackathon">
            Allow (coming soon)
          </button>
        </div>
      </section>
    </main>
  );
}
