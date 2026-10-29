"use client";

import { useState } from "react";
import type { PlatformTemplate } from "@/lib/types/attack";
import { PLATFORM_LABEL } from "@/lib/ads/platforms";
import { button, ui } from "./styles";

export const PUBLISH_NOTE = "Publishing launches after the hackathon";

/**
 * The Publish button, wired to a stub: it shows the payload AdFlank would send and makes NO
 * network call. Real publishing (platform APIs over OAuth) comes after the hackathon.
 */
export default function PublishStub({ template, initialOpen = false }: { template: PlatformTemplate; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const label = PLATFORM_LABEL[template.platform];
  return (
    <div>
      <button
        type="button"
        style={button(true)}
        onClick={() => { setOpen(true); setRecordedAt(new Date().toLocaleTimeString()); }}
        title={`${PUBLISH_NOTE}. Nothing is sent.`}
      >
        Publish to {label} <span style={{ fontWeight: 400, fontSize: 12, opacity: 0.9 }}>(preview)</span>
      </button>
      {open && (
        <div role="dialog" aria-label={`Publish to ${label} (stub)`} style={{ marginTop: 10, border: `1px solid ${ui.line}`, borderRadius: 10, background: "#fff", overflow: "hidden" }}>
          <div style={{ background: ui.warnBg, color: ui.warn, padding: "8px 12px", fontWeight: 700, fontSize: 14 }}>
            {PUBLISH_NOTE}
          </div>
          <div style={{ padding: "8px 12px", fontSize: 13, color: ui.ink }}>
            Nothing was sent. This is the payload AdFlank will send to the {label} Ads API once your account is connected.
            Everything is created PAUSED so you review it in {label} Ads before it spends.
            {recordedAt && <span style={{ color: ui.muted }}> Recorded locally at {recordedAt}.</span>}
          </div>
          <pre style={{ margin: 0, maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#0f172a", color: "#e2e8f0", padding: 12, fontSize: 12, lineHeight: 1.4 }}>
            {JSON.stringify(template.json, null, 2)}
          </pre>
          <div style={{ padding: 8, textAlign: "right" }}>
            <button type="button" style={button()} onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
