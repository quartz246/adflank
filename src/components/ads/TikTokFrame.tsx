import type { PlatformTemplate } from "@/lib/types/attack";
import { textLength } from "@/lib/ads/limits";
import { ctaLabel, tiktokView } from "./view";
import { ui } from "./styles";

/** TikTok in-feed mockup plus the video creative brief (approximate, for preview only). */
export default function TikTokFrame({ template }: { template: PlatformTemplate }) {
  const v = tiktokView(template.json);
  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start", fontFamily: ui.font }}>
      <figure aria-label="TikTok ad preview" style={{ margin: 0, width: 270, maxWidth: "100%", height: 480, flex: "none", borderRadius: 24, background: "#000", border: "6px solid #1f1f1f", position: "relative", overflow: "hidden", color: "#fff" }}>
        <div aria-label="Video placeholder" style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#1e3a8a,#7c3aed 50%,#db2777)", display: "grid", placeItems: "center", fontSize: 12, color: "rgba(255,255,255,.75)" }}>
          9:16 video from the brief
        </div>
        <div aria-hidden style={{ position: "absolute", right: 10, bottom: 130, display: "grid", gap: 16, textAlign: "center", fontSize: 11 }}>
          <span><span style={{ fontSize: 22 }}>♥</span><br />12.4K</span>
          <span><span style={{ fontSize: 20 }}>✉</span><br />318</span>
          <span><span style={{ fontSize: 20 }}>➦</span><br />Share</span>
        </div>
        <div style={{ position: "absolute", left: 12, right: 56, bottom: 56, textShadow: "0 1px 2px rgba(0,0,0,.6)" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{v.displayName}</div>
          <div style={{ fontSize: 13, lineHeight: 1.3, marginTop: 4 }}>{v.adText}</div>
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>Sponsored</div>
        </div>
        <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, background: "#fe2c55", borderRadius: 4, padding: "8px 10px", fontWeight: 700, fontSize: 13, textAlign: "center" }}>
          {ctaLabel(v.cta)} ›
        </div>
      </figure>
      <section aria-label="Creative brief" style={{ flex: "1 1 260px", minWidth: 240, fontSize: 14, color: ui.ink }}>
        <h4 style={{ margin: "0 0 6px", fontSize: 15 }}>Creative brief</h4>
        <p style={{ margin: "0 0 8px" }}><strong>Hook:</strong> {v.brief.hook}</p>
        <ol style={{ margin: "0 0 8px", paddingLeft: 20 }}>
          {v.brief.scenes.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        {v.brief.onScreenText.length > 0 && <p style={{ margin: "0 0 6px" }}><strong>On-screen text:</strong> {v.brief.onScreenText.join(" / ")}</p>}
        <p style={{ margin: "0 0 6px" }}><strong>Sound:</strong> {v.brief.sound}</p>
        {v.brief.creators.length > 0 && <p style={{ margin: "0 0 6px" }}><strong>Creators to sponsor:</strong> {v.brief.creators.join(", ")}</p>}
        <p style={{ margin: "8px 0 0", color: ui.muted, fontSize: 13 }}>
          Ad text {textLength(v.adText)}/100 (CJK counts 2) · {v.ageGroups.map((a) => a.replace("AGE_", "").replace("_100", "+").replace("_", "–")).join(", ")}
          {" · "}{v.gender === "GENDER_FEMALE" ? "women" : v.gender === "GENDER_MALE" ? "men" : "all genders"}
          {v.places.length > 0 && <> · {v.places.join("; ")}</>}
          {v.interests.length > 0 && <><br />Interests: {v.interests.join(", ")}</>}
        </p>
      </section>
    </div>
  );
}
