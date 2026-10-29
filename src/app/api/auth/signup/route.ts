import { z } from "zod";
import { csrfError, hashPassword, isHttps, json, newSessionCookie, validEmail } from "@/lib/auth/session";
import { users } from "@/lib/db/repo";
import { allow, clientIp } from "@/lib/limits";

export const runtime = "nodejs";
const body = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().min(8).max(200) }).strict();

export async function POST(req: Request) {
  const c = csrfError(req);
  if (c) return json({ error: c }, 403);
  const lim = allow("signup", clientIp(req));
  if (!lim.ok) return json({ error: lim.message }, 429);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success || !validEmail(p.data.email)) return json({ error: "Enter a valid email and a password of at least 8 characters." }, 400);
  if (p.data.email.endsWith(".invalid")) return json({ error: "Enter a valid email." }, 400);
  if (users.byEmail(p.data.email)) return json({ error: "That email already has an account. Log in instead." }, 409);
  const user = users.create(p.data.email, await hashPassword(p.data.password));
  const ck = newSessionCookie(user.id, isHttps(req));
  const res = json({ ok: true });
  res.headers.append("set-cookie", serializeCookie(ck));
  return res;
}

export function serializeCookie(ck: { name: string; value: string; options: Record<string, unknown> }): string {
  const o = ck.options;
  return [`${ck.name}=${ck.value}`, `Path=${o.path ?? "/"}`, `Max-Age=${o.maxAge ?? 0}`, "HttpOnly", "SameSite=Lax", o.secure ? "Secure" : ""].filter(Boolean).join("; ");
}
