"use client";

import { useState, type ReactNode } from "react";
import type { AdPlatform, AttackPackage, PlatformTemplate, TemplateIssue } from "@/lib/types/attack";
import { CSV_PLATFORMS, PLATFORMS, PLATFORM_LABEL } from "@/lib/ads/platforms";
import MetaFeedCard from "./MetaFeedCard";
import TikTokFrame from "./TikTokFrame";
import GoogleSerp from "./GoogleSerp";
import PublishStub from "./PublishStub";
import { button, ui } from "./styles";

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeName = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60) || "run";

export function IssuesList({ issues }: { issues: TemplateIssue[] }) {
  if (!issues.length) return <p style={{ margin: 0, color: ui.ok, fontSize: 13 }}>All platform limits pass.</p>;
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  return (
    <ul aria-label="Template issues" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
      {sorted.map((i, n) => (
        <li key={n} style={{ background: i.severity === "error" ? ui.errorBg : ui.warnBg, color: i.severity === "error" ? ui.error : ui.warn, borderRadius: 6, padding: "6px 8px", fontSize: 12, lineHeight: 1.4, overflowWrap: "anywhere" }}>
          <strong style={{ textTransform: "uppercase", fontSize: 11 }}>{i.severity}</strong>{" "}
          <code style={{ fontSize: 11 }}>{i.field}</code> {i.message}
        </li>
      ))}
    </ul>
  );
}

export function CiteChips({ cites, pkg }: { cites: string[]; pkg: AttackPackage }) {
  if (!cites.length) return <p style={{ margin: 0, fontSize: 13, color: ui.muted }}>No Qloo citations.</p>;
  return (
    <div aria-label="Qloo citations" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {cites.map((id) => {
        const c = pkg.citations[id];
        return (
          <span
            key={id}
            title={c ? `${c.tool} at ${c.at}${c.ok ? "" : " (failed)"}` : "Not in this package"}
            style={{ border: `1px solid ${c ? "#c7d2fe" : ui.line}`, background: c ? "#eef2ff" : "#fff", color: c ? "#3730a3" : ui.muted, borderRadius: 999, padding: "2px 8px", fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          >
            {id}{c ? ` · ${c.tool.replace(/^qloo_/, "")}` : ""}
          </span>
        );
      })}
    </div>
  );
}

/** Ad templates for one attack package: mockups, limits, citations, downloads, connect and publish (stub). */
export default function AdsPanel({ pkg, templates, initialPlatform, initialPublishOpen = false, connectFrom }: {
  pkg: AttackPackage;
  templates: PlatformTemplate[];
  initialPlatform?: AdPlatform;
  initialPublishOpen?: boolean;
  /** This page's path (e.g. /projects/abc/ads) so the connect screen can link back. */
  connectFrom?: string;
}) {
  const available = PLATFORMS.filter((p) => templates.some((t) => t.platform === p));
  const [tab, setTab] = useState<AdPlatform | undefined>(initialPlatform && available.includes(initialPlatform) ? initialPlatform : available[0]);
  const t = templates.find((x) => x.platform === tab);
  const competitor = pkg.competitor.name;
  const brand = pkg.brand.name;

  return (
    <section aria-label="Ad templates" style={{ fontFamily: ui.font, color: ui.ink, background: ui.bg, border: `1px solid ${ui.line}`, borderRadius: 12, padding: 20, boxShadow: "0 1px 2px rgba(15,23,42,.05)" }}>
      <header style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: ui.muted }}>Ad templates</div>
        <h2 style={{ margin: "2px 0 0", fontSize: 20 }}>{brand} <span style={{ color: "#94a3b8", fontWeight: 600 }}>vs</span> {competitor}</h2>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: ui.muted }}>
          Ready-to-publish campaigns for {brand}, built to reach people like {competitor}&apos;s customers.
          Run <code>{pkg.runId}</code>. Every claim cites the Qloo call it came from.
        </p>
      </header>

      <div role="tablist" aria-label="Ad platform" style={{ display: "flex", gap: 6, borderBottom: `1px solid ${ui.line}`, marginBottom: 14 }}>
        {available.map((p) => {
          const tp = templates.find((x) => x.platform === p)!;
          const errors = tp.issues.filter((i) => i.severity === "error").length;
          const warns = tp.issues.length - errors;
          const active = p === tab;
          return (
            <button
              key={p}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(p)}
              style={{ border: "none", borderBottom: `3px solid ${active ? ui.accent : "transparent"}`, background: "none", padding: "8px 14px", marginBottom: -1, fontSize: 15, fontWeight: active ? 700 : 500, color: active ? ui.ink : ui.muted, cursor: "pointer", fontFamily: ui.font }}
            >
              {PLATFORM_LABEL[p]}
              {errors > 0 && <span style={{ marginLeft: 6, background: ui.error, color: "#fff", borderRadius: 999, padding: "0 6px", fontSize: 11 }}>{errors}</span>}
              {errors === 0 && warns > 0 && <span style={{ marginLeft: 6, background: "#fde68a", color: ui.warn, borderRadius: 999, padding: "0 6px", fontSize: 11 }}>{warns}</span>}
            </button>
          );
        })}
      </div>

      {!t ? (
        <p style={{ color: ui.muted }}>No templates for this package yet.</p>
      ) : (
        <div role="tabpanel" aria-label={`${PLATFORM_LABEL[t.platform]} template`} style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "2 1 420px", minWidth: 0, background: ui.stage, border: `1px solid ${ui.line}`, borderRadius: 12, padding: 20 }}>
            <div style={{ width: "fit-content", maxWidth: "100%", margin: "0 auto" }}>
              {t.platform === "meta" && <MetaFeedCard template={t} brand={brand} />}
              {t.platform === "tiktok" && <TikTokFrame template={t} />}
              {t.platform === "google" && <GoogleSerp template={t} brand={brand} />}
            </div>
          </div>
          <aside style={{ flex: "1 1 300px", minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
            <PanelBlock title="Export">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" style={button()} onClick={() => download(`adflank_${t.platform}_${safeName(t.packageRunId)}.json`, JSON.stringify(t.json, null, 2), "application/json")}>
                  Download JSON
                </button>
                {CSV_PLATFORMS.includes(t.platform) && (t.csv ? (
                  <button type="button" style={button()} onClick={() => download(t.csv!.filename, t.csv!.content, "text/csv;charset=utf-8")}>
                    Download CSV
                  </button>
                ) : (
                  <button type="button" style={{ ...button(), opacity: 0.5, cursor: "not-allowed" }} disabled title="Fix the errors below to export the CSV">
                    Download CSV
                  </button>
                ))}
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: ui.muted }}>
                {t.platform === "meta" && "CSV in the Ads Manager bulk-import shape. "}
                {t.platform === "google" && "CSV for Google Ads Editor (Account › Import). "}
                {t.platform === "tiktok" && "TikTok has no public bulk CSV: JSON in Business API shape plus the creative brief. "}
                {CSV_PLATFORMS.includes(t.platform) && !t.csv && <strong style={{ color: ui.error }}>CSV blocked until the errors are fixed. </strong>}
                Everything imports paused.
              </p>
            </PanelBlock>
            <PanelBlock title={`Go live on ${PLATFORM_LABEL[t.platform]}`}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                <a href={`/connect/${t.platform}${connectFrom ? `?from=${encodeURIComponent(connectFrom)}` : ""}`} style={button()}>Connect {PLATFORM_LABEL[t.platform]} Ads</a>
              </div>
              <div style={{ marginTop: 8 }}>
                <PublishStub key={t.platform} template={t} initialOpen={initialPublishOpen} />
              </div>
            </PanelBlock>
            <PanelBlock title={`Limits check (${t.issues.length})`}>
              <IssuesList issues={t.issues} />
            </PanelBlock>
            <PanelBlock title="Sources">
              <CiteChips cites={t.cites} pkg={pkg} />
            </PanelBlock>
          </aside>
        </div>
      )}
    </section>
  );
}

function PanelBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: ui.panel, border: `1px solid ${ui.line}`, borderRadius: 10, padding: 12 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.4, color: ui.muted }}>{title}</h3>
      {children}
    </div>
  );
}
