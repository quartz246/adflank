"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

/** "Paste your website": starts the six-step run and opens its live page. */
export default function SiteForm({ big = true }: { big?: boolean }) {
  const [site, setSite] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Sites that give rich runs (both rivals in Qloo, a real taste gap, 5-14 metros), checked live on 10-30.
  const hint = useTypedHint(["allbirds.com", "tesla.com", "hoka.com"]);
  return (
    <>
    <form
      className={`siteform${big ? " big" : ""}`}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        const r = await api<{ projectId: number }>("/api/go", { body: { site } });
        if (!r.ok) {
          setBusy(false);
          return setErr(r.data.error ?? "Could not start. Try again.");
        }
        window.location.href = `/go/${r.data.projectId}`;
      }}
    >
      <span className="pre" aria-hidden>https://</span>
      <input aria-label="Your website" required value={site} onChange={(e) => setSite(e.target.value)} placeholder={hint} autoComplete="url" inputMode="url" spellCheck={false} />
      <button className="btn large glow" disabled={busy}>{busy ? "Starting the agents…" : <>Find my competitors&apos; customers <span className="arrow" aria-hidden>→</span></>}</button>
      {err && <p className="err" role="alert">{err}</p>}
    </form>
    <a className="siteform-steps" href={`/start${site.trim() ? `?site=${encodeURIComponent(site.trim())}` : ""}`}>or pick your rivals, market and budget step by step →</a>
    </>
  );
}

/** Placeholder that types example sites, one after another. */
function useTypedHint(words: string[]): string {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  useEffect(() => {
    const w = words[i % words.length];
    const t = setTimeout(() => (n < w.length ? setN(n + 1) : (setI(i + 1), setN(0))), n < w.length ? 90 : 1600);
    return () => clearTimeout(t);
  }, [i, n, words]);
  return words[i % words.length].slice(0, n) || " ";
}
