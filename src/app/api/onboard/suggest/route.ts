import { z } from "zod";
import { csrfError, json } from "@/lib/auth/session";
import { allow, clientIp } from "@/lib/limits";
import { normaliseSite } from "@/lib/site/read";
import { suggestRivals } from "@/lib/agent/onboard";

export const runtime = "nodejs";
const body = z.object({ site: z.string().trim().min(3).max(300) }).strict();

/** Onboarding step 2: the brand from its website and the brands its fans also like on Qloo (the rivals to tick). */
export async function POST(req: Request) {
  const c = csrfError(req);
  if (c) return json({ error: c }, 403);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "Enter a public website, like allbirds.com." }, 400);
  const url = normaliseSite(p.data.site);
  if (!url) return json({ error: "Enter a public website, like allbirds.com." }, 400);
  const lim = allow("lookup", clientIp(req));
  if (!lim.ok) return json({ error: lim.message }, 429);
  try {
    return json(await suggestRivals(url));
  } catch {
    return json({ error: "Qloo did not answer. Try again, or skip and let the agents pick." }, 502);
  }
}
