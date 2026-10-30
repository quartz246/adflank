import { randomBytes } from "node:crypto";
import { z } from "zod";
import { GUEST_DOMAIN, isGuestUser, csrfError, currentUser, isHttps, json, newSessionCookie } from "@/lib/auth/session";
import { projects, users } from "@/lib/db/repo";
import { COUNTRY_CODES } from "@/lib/geo/cities";
import { isDemoUser } from "@/lib/demo";
import { allow, allowRun, clientIp } from "@/lib/limits";
import { startRun } from "@/lib/agent/run";
import { SITE_TRIGGER } from "@/lib/agent/wizard";
import { domainOf, normaliseSite } from "@/lib/site/read";
import { serializeCookie } from "../auth/signup/route";

export const runtime = "nodejs";

const body = z
  .object({
    site: z.string().trim().min(3).max(300),
    countryCode: z.string().trim().toUpperCase().refine((c) => COUNTRY_CODES.includes(c), "Unsupported country").optional(),
  })
  .strict();

/** "Paste your website": a guest account (unless logged in), a project for the site, and the six-step run. */
export async function POST(req: Request) {
  const c = csrfError(req);
  if (c) return json({ error: c }, 403);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.issues[0]?.message ?? "invalid input" }, 400);
  const url = normaliseSite(p.data.site);
  if (!url) return json({ error: "Enter a public website, like allbirds.com." }, 400);
  const ip = clientIp(req);

  let user = await currentUser();
  let cookie: string | null = null;
  if (!user || isDemoUser(user)) {
    const lim = allow("signup", ip);
    if (!lim.ok) return json({ error: lim.message }, 429);
    user = users.create(`guest-${randomBytes(6).toString("hex")}${GUEST_DOMAIN}`, "!guest-no-password");
    cookie = serializeCookie(newSessionCookie(user.id, isHttps(req), true));
  }
  const plim = allow("project", `u${user.id}`);
  if (!plim.ok) return json({ error: plim.message }, 429);
  const rlim = allowRun(user.id, ip, false);
  if (!rlim.ok) return json({ error: rlim.message }, 429);

  const project = projects.create(user.id, domainOf(url), p.data.countryCode ?? "US", null);
  // Guest projects do not run daily on their own; signing up turns the schedule on.
  projects.update(project.id, { landing_url: url, schedule_daily: isGuestUser(user) ? 0 : 1 });
  const { runId } = startRun(project.id, SITE_TRIGGER);
  const res = json({ projectId: project.id, runId }, 202);
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}
