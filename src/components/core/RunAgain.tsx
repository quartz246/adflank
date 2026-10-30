"use client";
import { useState } from "react";
import { api } from "./api";

/** Starts a fresh run of a project (the agents re-read the rivals' fans on Qloo) and opens its live page. */
export default function RunAgain({ projectId, running }: { projectId: number; running: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (running) return <a className="mc-btn ghost" href={`/go/${projectId}`}>Watch the agents</a>;
  return (
    <>
      <button
        type="button"
        className="mc-btn ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          const r = await api(`/api/projects/${projectId}/runs`, { body: {} });
          if (!r.ok) {
            setBusy(false);
            return setErr(r.data.error ?? "Could not start. Try again.");
          }
          window.location.href = `/go/${projectId}`;
        }}
      >
        {busy ? "Starting…" : "Run again"}
      </button>
      {err && <span className="mc-err" role="alert">{err}</span>}
    </>
  );
}
