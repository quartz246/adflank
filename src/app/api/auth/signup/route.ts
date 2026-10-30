import { z } from "zod";
import { csrfError, currentUser, isGuestUser, hashPassword, isHttps, json, newSessionCookie, validEmail } from "@/lib/auth/session";
import { projects, users } from "@/lib/db/repo";
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
  const guest = await currentUser();
  if (isGuestUser(guest)) {
    // "Save it": the guest's website projects move with the account and start running daily.
    users.claim(guest!.id, p.data.email, await hashPassword(p.data.password));
    for (const pr of projects.forUser(guest!.id)) projects.update(pr.id, { schedule_daily: 1 });
    const res = json({ ok: true, claimed: true });
    res.headers.append("set-cookie", serializeCookie(newSessionCookie(guest!.id, isHttps(req))));
    return res;
  }
  const user = users.create(p.data.email, await hashPassword(p.data.password));
  const ck = newSessionCookie(user.id, isHttps(req));
  const res = json({ ok: true });
  res.headers.append("set-cookie", serializeCookie(ck));
  return res;
}

export function serializeCookie(ck: { name: string; value: string; options: Record<string, unknown> }): string {
  const o = ck.options;
  return [`${ck.name}=${ck.value}`, `Path=${o.path ?? "/"}`, o.maxAge === undefined ? "" : `Max-Age=${o.maxAge}`, "HttpOnly", "SameSite=Lax", o.secure ? "Secure" : ""].filter(Boolean).join("; ");
}
