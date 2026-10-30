import { z } from "zod";
import { csrfError, json } from "@/lib/auth/session";
import { allow, clientIp } from "@/lib/limits";
import { NAME_RE } from "@/lib/agent/check";
import { searchRival } from "@/lib/agent/onboard";

export const runtime = "nodejs";
const body = z.object({ name: z.string().trim().min(2).max(60).regex(NAME_RE) }).strict();

/** Onboarding: look a rival up in Qloo by name (the exact match, or Qloo's closest candidates). */
export async function POST(req: Request) {
  const c = csrfError(req);
  if (c) return json({ error: c }, 403);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "Use letters, numbers and simple punctuation only." }, 400);
  const lim = allow("lookup", clientIp(req));
  if (!lim.ok) return json({ error: lim.message }, 429);
  try {
    return json({ rivals: await searchRival(p.data.name) });
  } catch {
    return json({ error: "Qloo did not answer. Try again." }, 502);
  }
}
