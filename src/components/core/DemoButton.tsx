"use client";
import { useState } from "react";
import { api } from "./api";

export default function DemoButton({ className = "btn large glow", label = "Try the live demo (no signup)" }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <span className="row">
      <button className={className} disabled={busy} onClick={async () => {
        setBusy(true);
        const r = await api<{ projectId: number | null }>("/api/auth/demo", { body: {} });
        setBusy(false);
        if (!r.ok) return setErr(r.data.error ?? "Demo unavailable.");
        window.location.href = r.data.projectId ? `/projects/${r.data.projectId}` : "/projects";
      }}>{busy ? "Opening the demo…" : <>{label} <span className="arrow" aria-hidden>→</span></>}</button>
      {err && <span className="err">{err}</span>}
    </span>
  );
}
