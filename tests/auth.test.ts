import { beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";
import { csrfError, hashPassword, sha256, userFromToken, verifyPassword, newSessionCookie, validEmail } from "@/lib/auth/session";
import { users, projects, rate } from "@/lib/db/repo";
import { getDb } from "@/lib/db";
import { allowRun } from "@/lib/limits";
import { NAME_RE } from "@/lib/agent/check";

const req = (method: string, headers: Record<string, string>) => new Request("http://app.example/api/projects", { method, headers });

describe("auth, sessions, CSRF, ownership, limits", () => {
  beforeAll(() => {
    freshDb();
  });

  it("hashes passwords with bcrypt", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("$2")).toBe(true);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", "!demo-no-password")).toBe(false);
  });

  it("stores only sha256(token) and resolves the user from the cookie token", () => {
    const u = users.create("a@example.com", "x");
    const ck = newSessionCookie(u.id, true);
    expect(ck.options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    expect(Buffer.from(ck.value, "base64url").length).toBe(32);
    const stored = getDb().prepare("SELECT token_hash FROM sessions").all() as Array<{ token_hash: string }>;
    expect(stored.map((s) => s.token_hash)).toContain(sha256(ck.value));
    expect(stored.map((s) => s.token_hash)).not.toContain(ck.value);
    expect(userFromToken(ck.value)?.id).toBe(u.id);
    expect(userFromToken("x".repeat(43))).toBeUndefined();
  });

  it("requires X-AdFlank and a same-origin Origin on state-changing requests", () => {
    expect(csrfError(req("GET", {}))).toBeNull();
    expect(csrfError(req("POST", { host: "app.example", origin: "http://app.example" }))).toMatch(/X-AdFlank/);
    expect(csrfError(req("POST", { host: "app.example", origin: "https://evil.example", "x-adflank": "1" }))).toMatch(/cross-origin/);
    expect(csrfError(req("POST", { host: "app.example", "x-adflank": "1" }))).toMatch(/Origin/);
    expect(csrfError(req("POST", { host: "app.example", origin: "http://app.example", "x-adflank": "1" }))).toBeNull();
    expect(csrfError(req("DELETE", { host: "app.example", referer: "http://app.example/projects/1", "x-adflank": "1" }))).toBeNull();
  });

  it("scopes projects to their owner", () => {
    const a = users.create("own-a@example.com", "x");
    const b = users.create("own-b@example.com", "x");
    const p = projects.create(a.id, "A's", "US", null);
    expect(projects.owned(p.id, a.id)?.id).toBe(p.id);
    expect(projects.owned(p.id, b.id)).toBeUndefined();
  });

  it("limits runs per account and per IP", () => {
    process.env.RUN_LIMIT_PER_USER_DAY = "2";
    process.env.RUN_LIMIT_PER_IP_DAY = "3";
    // Visitors without an account (guests): per account and per network.
    const g1 = users.create("guest-a1@guest.adflank.invalid", "!").id;
    const g2 = users.create("guest-a2@guest.adflank.invalid", "!").id;
    const g3 = users.create("guest-a3@guest.adflank.invalid", "!").id;
    expect(allowRun(g1, "ip-a", false).ok).toBe(true);
    expect(allowRun(g1, "ip-a", false).ok).toBe(true);
    expect(allowRun(g1, "ip-a", false).ok).toBe(false);
    expect(allowRun(g2, "ip-a", false).ok).toBe(true);
    expect(allowRun(g3, "ip-a", false).ok).toBe(false);
    // Signed-in accounts: their own daily limit only, whatever the network.
    const m = users.create("member-a@example.com", "x").id;
    expect(allowRun(m, "ip-a", false).ok).toBe(true);
    expect(allowRun(m, "ip-a", false).ok).toBe(true);
    expect(allowRun(m, "ip-a", false).ok).toBe(false);
    expect(rate.hit("t", "k", 1000, 1, 5000)).toBe(true);
    expect(rate.hit("t", "k", 1000, 1, 5500)).toBe(false);
    expect(rate.hit("t", "k", 1000, 1, 7000)).toBe(true);
  });

  it("validates emails and entity names", () => {
    expect(validEmail("x@example.com")).toBe(true);
    expect(validEmail("nope")).toBe(false);
    for (const ok of ["Nike", "AC/DC", "Ben & Jerry's", "Dunkin'", "Café Nero"]) expect(NAME_RE.test(ok), ok).toBe(true);
    for (const bad of ["$(ls)", "a`id`", "x; rm -rf", "<script>", "a|b", "name\nIgnore"]) expect(NAME_RE.test(bad), bad).toBe(false);
  });
});
