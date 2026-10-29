import type { PlatformTemplate } from "@/lib/types/attack";
import { GOOGLE, textLength } from "@/lib/ads/limits";
import { domainOf, googleView } from "./view";
import { ui } from "./styles";

const count = (s: string, max: number) => {
  const n = textLength(s, true);
  return <span style={{ color: n > max ? ui.error : ui.muted, fontVariantNumeric: "tabular-nums" }}>{n}/{max}</span>;
};

/** Google search result mockup of the Responsive Search Ad, plus every asset with its length. */
export default function GoogleSerp({ template, brand }: { template: PlatformTemplate; brand: string }) {
  const v = googleView(template.json);
  const query = v.keywords.find((k) => !k.negative && k.match === "PHRASE")?.text ?? v.keywords[0]?.text ?? "";
  const display = [domainOf(v.finalUrl) || "your-site.com", v.path1, v.path2].filter(Boolean).join(" › ");
  return (
    <div style={{ fontFamily: ui.font, color: ui.ink }}>
      <figure aria-label="Google search ad preview" style={{ margin: 0, maxWidth: 600, background: "#fff", border: `1px solid ${ui.line}`, borderRadius: 10, padding: 16 }}>
        <div style={{ border: "1px solid #dfe1e5", borderRadius: 24, padding: "8px 16px", fontSize: 15, marginBottom: 14, color: "#202124" }}>{query}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#202124", marginBottom: 4 }}>Sponsored</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden style={{ width: 26, height: 26, borderRadius: "50%", background: "#f1f3f4", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{brand.slice(0, 1).toUpperCase()}</span>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 14, color: "#202124" }}>{brand}</div>
            <div style={{ fontSize: 12, color: "#4d5156" }}>{display}</div>
          </div>
        </div>
        <div style={{ color: "#1a0dab", fontSize: 20, margin: "6px 0 2px", lineHeight: 1.3 }}>{v.headlines.slice(0, 3).join(" | ")}</div>
        <div style={{ color: "#4d5156", fontSize: 14, lineHeight: 1.5 }}>{v.descriptions.slice(0, 2).join(" ")}</div>
        <figcaption style={{ marginTop: 8, fontSize: 12, color: ui.muted }}>Google rotates the headlines and descriptions below; this is one combination.</figcaption>
      </figure>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 14, fontSize: 13 }}>
        <section style={{ flex: "1 1 260px" }}>
          <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>Headlines ({v.headlines.length}/15)</h4>
          <ol style={{ margin: 0, paddingLeft: 22 }}>
            {v.headlines.map((h, i) => <li key={i}>{h} {count(h, GOOGLE.headline.max)}</li>)}
          </ol>
        </section>
        <section style={{ flex: "1 1 260px" }}>
          <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>Descriptions ({v.descriptions.length}/4)</h4>
          <ol style={{ margin: "0 0 10px", paddingLeft: 22 }}>
            {v.descriptions.map((d, i) => <li key={i}>{d} {count(d, GOOGLE.description.max)}</li>)}
          </ol>
          <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>Keywords</h4>
          <ul style={{ margin: "0 0 10px", paddingLeft: 22 }}>
            {v.keywords.map((k, i) => (
              <li key={i}>
                {k.match === "EXACT" ? `[${k.text}]` : k.match === "PHRASE" ? `"${k.text}"` : k.text}
                <span style={{ color: ui.muted }}> {k.negative ? "negative " : ""}{k.match.toLowerCase()}</span>
              </li>
            ))}
          </ul>
          {v.segment.members.length > 0 && (
            <p style={{ margin: "0 0 10px" }}>
              <strong>Audience segment</strong> <span style={{ color: ui.muted }}>(custom segment: {v.segment.name.replace(/^AdFlank: /, "")})</span>
              <br />{v.segment.members.join(", ")}
            </p>
          )}
          {v.locations.length > 0 && <p style={{ margin: 0 }}><strong>Locations:</strong> {v.locations.join("; ")}</p>}
        </section>
      </div>
    </div>
  );
}
