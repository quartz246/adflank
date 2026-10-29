import { csrfError, isHttps, json, newSessionCookie } from "@/lib/auth/session";
import { demoEnabled, demoUser, ensureDemo } from "@/lib/demo";
import { allow, clientIp } from "@/lib/limits";
import { serializeCookie } from "../signup/route";

export const runtime = "nodejs";

/** One-click login to the shared judge/demo account (no password; its seeded project is read-only). */
export async function POST(req: Request) {
  const c = csrfError(req);
  if (c) return json({ error: c }, 403);
  if (!demoEnabled()) return json({ error: "The demo account is disabled." }, 404);
  const lim = allow("login", clientIp(req));
  if (!lim.ok) return json({ error: lim.message }, 429);
  const u = demoUser();
  const seeded = await ensureDemo().catch(() => null);
  const res = json({ ok: true, projectId: seeded?.projectId ?? null });
  res.headers.append("set-cookie", serializeCookie(newSessionCookie(u.id, isHttps(req))));
  return res;
}
