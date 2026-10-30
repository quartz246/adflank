"use client";
import { useState } from "react";
import { api } from "./api";

export default function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await api(`/api/auth/${mode}`, { body: { email, password } });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "Something went wrong.");
    window.location.href = next ?? "/projects";
  }
  return (
    <form onSubmit={submit} className="card stack" style={{ padding: 28 }}>
      <div>
        <h1>{mode === "login" ? "Welcome back" : next ? "Save your project" : "Create your account"}</h1>
        <p className="muted small">{mode === "login" ? "Log in to see your projects and the latest runs." : next ? "Free, instant. Your research stays, and the team runs it again every day." : "Free, instant, no email verification. Add your first brand in a minute."}</p>
      </div>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></label>
      <label>Password{mode === "signup" && <span className="hint"> at least 8 characters</span>}<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p className="notice bad" role="alert">{error}</p>}
      <button className="btn large" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Log in" : "Create account"}</button>
      <p className="small muted" style={{ margin: 0, textAlign: "center" }}>{mode === "login" ? <>No account? <a href="/signup">Sign up</a></> : <>Have an account? <a href="/login">Log in</a></>}</p>
    </form>
  );
}
