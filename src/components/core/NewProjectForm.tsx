"use client";
import { useState } from "react";
import { api } from "./api";

export default function NewProjectForm({ countries }: { countries: Array<{ code: string; name: string }> }) {
  const [brand, setBrand] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [countryCode, setCountry] = useState("US");
  const [city, setCity] = useState("");
  const [landingUrl, setLanding] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const list = competitors.split(",").map((s) => s.trim()).filter(Boolean);
    const r = await api<{ project: { id: number } }>("/api/projects", { body: { brand: brand.trim(), competitors: list, countryCode, ...(city.trim() ? { city: city.trim() } : {}), ...(landingUrl.trim() ? { landingUrl: landingUrl.trim() } : {}) } });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "Could not create the project.");
    window.location.href = `/projects/${r.data.project.id}`;
  }
  return (
    <form onSubmit={submit} className="card stack">
      <div>
        <h2>New project</h2>
        <p className="card-sub">Each name is checked in Qloo when you create the project.</p>
      </div>
      <label>Your brand<input required maxLength={80} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Allbirds" /></label>
      <label>Competitors <span className="hint">comma-separated, up to 5</span><input required value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="e.g. Nike, Adidas" /></label>
      <div className="field-row">
        <label>Country<select value={countryCode} onChange={(e) => setCountry(e.target.value)}>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
        <label>City <span className="hint">optional</span><input maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Chicago" /></label>
      </div>
      <label>Landing page for the ads <span className="hint">optional, https</span><input type="url" maxLength={300} value={landingUrl} onChange={(e) => setLanding(e.target.value)} placeholder="https://www.example.com/shoes" /></label>
      {error && <p className="notice bad" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? "Checking names in Qloo…" : "Create and check in Qloo"}</button>
    </form>
  );
}
