import type { PlatformTemplate } from "@/lib/types/attack";
import { ctaLabel, domainOf, metaView } from "./view";
import { ui } from "./styles";

/** Facebook Feed mockup of the Meta template (approximate, for preview only). */
export default function MetaFeedCard({ template, brand }: { template: PlatformTemplate; brand: string }) {
  const v = metaView(template.json);
  const cut = v.primaryText.length > 125;
  return (
    <figure aria-label="Meta feed ad preview" style={{ margin: 0, width: "100%", maxWidth: 380, background: "#fff", border: "1px solid #dadde1", borderRadius: 10, fontFamily: ui.font, color: "#050505", boxShadow: "0 1px 2px rgba(0,0,0,.1)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 8px" }}>
        <div aria-hidden style={{ width: 40, height: 40, borderRadius: "50%", background: ui.brandGradient, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700 }}>
          {brand.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{brand}</div>
          <div style={{ fontSize: 13, color: "#65676b" }}>Sponsored · Public</div>
        </div>
      </div>
      <p style={{ margin: 0, padding: "0 12px 10px", fontSize: 15, lineHeight: 1.35, whiteSpace: "pre-wrap" }}>
        {cut ? `${v.primaryText.slice(0, 125)}… ` : v.primaryText}
        {cut && <span style={{ color: "#65676b", fontWeight: 600 }}>See more</span>}
      </p>
      <div aria-label="Creative placeholder" style={{ height: 200, background: "linear-gradient(135deg,#3b2f2f,#a0522d 55%,#e3b778)", display: "grid", placeItems: "center", color: "rgba(255,255,255,.9)", fontSize: 13 }}>
        Image or video, 1080×1080
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f0f2f5" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#65676b", textTransform: "uppercase" }}>{domainOf(v.link) || "your-site"}</div>
          <div style={{ fontWeight: 600, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.headline}</div>
          <div style={{ fontSize: 14, color: "#65676b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.description}</div>
        </div>
        <span style={{ background: "#e4e6eb", borderRadius: 6, padding: "8px 12px", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>{ctaLabel(v.cta)}</span>
      </div>
      <figcaption style={{ padding: "8px 12px 10px", fontSize: 12, color: "#65676b", borderTop: "1px solid #e4e6eb" }}>
        {v.objective} · ages {v.ageMin}–{v.ageMax}{v.ageMax === "65" ? "+" : ""} · {v.genders.length === 1 ? (v.genders[0] === "2" ? "women" : "men") : "all genders"}
        {v.places.length > 0 && <> · {v.places.join(", ")}</>}
        {v.interests.length > 0 && <div style={{ marginTop: 4 }}>Interests: {v.interests.join(", ")}</div>}
      </figcaption>
    </figure>
  );
}
