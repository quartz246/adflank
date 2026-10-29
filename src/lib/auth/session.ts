import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { sessions, users, projects, type ProjectRow, type UserRow } from "@/lib/db/repo";

/**
 * Sessions: a random 32-byte token in an httpOnly SameSite=Lax cookie; only sha256(token) is stored,
 * so no server-side session secret exists. CSRF: every non-GET API call needs a same-origin Origin
 * (or Referer) and the custom X-AdFlank header, which a cross-site form cannot send.
 */
export const SESSION_COOKIE = "adflank_session";
const TTL_DAYS = 14;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  if (!hash.startsWith("$2")) return false;
  try {
    return await bcrypt.compare(pw, hash);
  } catch {
    return false;
  }
}

export function isHttps(req: Request): boolean {
  const xf = req.headers.get("x-forwarded-proto");
  if (xf) return xf.split(",")[0].trim() === "https";
  return new URL(req.url).protocol === "https:";
}

export function newSessionCookie(userId: number, secure: boolean): { name: string; value: string; options: Record<string, unknown> } {
  const token = randomBytes(32).toString("base64url");
  sessions.create(sha256(token), userId, TTL_DAYS);
  return { name: SESSION_COOKIE, value: token, options: { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: TTL_DAYS * 86400 } };
}

export function userFromToken(token: string | undefined): UserRow | undefined {
  if (!token || token.length < 20 || token.length > 100) return undefined;
  return sessions.user(sha256(token));
}

/** The logged-in user for server components and route handlers. */
export async function currentUser(): Promise<UserRow | undefined> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

/** sha256 of the current session token (scopes per-visitor data on the shared demo account). */
export async function currentSessionHash(): Promise<string | undefined> {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  return t ? sha256(t) : undefined;
}

/** CSRF gate for state-changing requests. Returns an error message or null when the request is allowed. */
export function csrfError(req: Request): string | null {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return null;
  if (req.headers.get("x-adflank") !== "1") return "missing X-AdFlank header";
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin || !host) return "missing Origin";
  let originHost = "";
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return "bad Origin";
  }
  return originHost === host ? null : "cross-origin request";
}

export const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...(headers ?? {}) } });

export type Guarded = { user: UserRow; project?: ProjectRow } | { error: Response };

/** Common guard for API routes: CSRF + login, and project ownership when projectId is given. */
export async function guard(req: Request, projectId?: string | number): Promise<Guarded> {
  const c = csrfError(req);
  if (c) return { error: json({ error: c }, 403) };
  const user = await currentUser();
  if (!user) return { error: json({ error: "not logged in" }, 401) };
  if (projectId === undefined) return { user };
  const id = Number(projectId);
  const project = Number.isInteger(id) ? projects.owned(id, user.id) : undefined;
  // Same answer for "missing" and "not yours", so ids cannot be probed.
  if (!project) return { error: json({ error: "not found" }, 404) };
  return { user, project };
}

export function validEmail(e: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
}

export { users };
