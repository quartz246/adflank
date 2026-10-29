import { cookies } from "next/headers";
import { csrfError, json, SESSION_COOKIE, sha256 } from "@/lib/auth/session";
import { sessions } from "@/lib/db/repo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const c = csrfError(req);
  if (c) return json({ error: c }, 403);
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) sessions.delete(sha256(token));
  const res = json({ ok: true });
  res.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return res;
}
