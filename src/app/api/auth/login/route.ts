import { z } from "zod";
import { csrfError, isHttps, json, newSessionCookie, verifyPassword } from "@/lib/auth/session";
import { users } from "@/lib/db/repo";
import { serializeCookie } from "../signup/route";
import { allow, clientIp } from "@/lib/limits";

export const runtime = "nodejs";
const body = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(200) }).strict();

export async function POST(req: Request) {
  const c = csrfError(req);
  if (c) return json({ error: c }, 403);
  const lim = allow("login", clientIp(req));
  if (!lim.ok) return json({ error: lim.message }, 429);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "Wrong email or password." }, 401);
  const user = users.byEmail(p.data.email);
  const ok = user ? await verifyPassword(p.data.password, user.pass_hash) : await verifyPassword(p.data.password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
  if (!user || !ok) return json({ error: "Wrong email or password." }, 401);
  const res = json({ ok: true });
  res.headers.append("set-cookie", serializeCookie(newSessionCookie(user.id, isHttps(req))));
  return res;
}
