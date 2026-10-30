import { randomBytes } from "node:crypto";
import { z } from "zod";
import { GUEST_DOMAIN, isGuestUser, csrfError, currentUser, isHttps, json, newSessionCookie } from "@/lib/auth/session";
import { campaignSettings, entities, projects, users } from "@/lib/db/repo";
import { NAME_RE } from "@/lib/agent/check";
import { BANDS, budgetAt, PLATFORMS, runsFor, SLIDER, type CampaignSettings } from "@/lib/campaign/plan";
import { COUNTRY_CODES } from "@/lib/geo/cities";
import { isDemoUser } from "@/lib/demo";
import { allow, allowRun, clientIp } from "@/lib/limits";
import { startRun } from "@/lib/agent/run";
import { MAX_RIVALS, SITE_TRIGGER } from "@/lib/agent/wizard";
import { domainOf, normaliseSite } from "@/lib/site/read";
import { serializeCookie } from "../auth/signup/route";

export const runtime = "nodejs";

const body = z
  .object({
    site: z.string().trim().min(3).max(300),
    countryCode: z.string().trim().toUpperCase().refine((c) => COUNTRY_CODES.includes(c), "Unsupported country").optional(),
    // From the step-by-step setup: rivals ticked from Qloo's list, and campaign preferences.
    competitors: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9-]{6,64}$/), name: z.string().trim().min(1).max(60).regex(NAME_RE) }).strict()).max(MAX_RIVALS).optional(),
    prefs: z.object({ pos: z.number().int().min(0).max(SLIDER), plats: z.array(z.enum(PLATFORMS)).max(3), ages: z.array(z.enum(BANDS)).max(5) }).strict().optional(),
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

  // A brand is one project per owner: the same website again re-runs it (with any newly picked rivals) instead of duplicating it.
  const domain = domainOf(url);
  const existing = projects.forUser(user.id).find((x) => {
    try {
      return x.landing_url ? domainOf(x.landing_url) === domain : x.name === domain;
    } catch {
      return false;
    }
  });
  const project = existing ?? projects.create(user.id, domain, p.data.countryCode ?? "US", null);
  // Guest projects do not run daily on their own; signing up turns the schedule on.
  projects.update(project.id, { landing_url: url, schedule_daily: isGuestUser(user) ? 0 : 1, ...(existing && p.data.countryCode ? { country_code: p.data.countryCode } : {}) });
  if (existing && p.data.competitors?.length) for (const e of entities.forProject(project.id).filter((x) => x.role === "competitor")) entities.remove(e.id);
  // Rivals the owner picked are set before the run; the agents then skip choosing and profile these.
  for (const c of p.data.competitors ?? []) {
    const e = entities.add(project.id, "competitor", c.name);
    entities.setResolution(e.id, { status: "found", qloo_id: c.id, qloo_type: "urn:entity:brand", qloo_name: c.name });
  }
  if (p.data.prefs) {
    const { pos, plats, ages } = p.data.prefs;
    const s: CampaignSettings = { v: 1, pos, active: Array.from({ length: runsFor(budgetAt(pos)) }, (_, n) => n), retired: [], match: "balanced", perSet: 1, ages: ages.length ? ages : [...BANDS], plats: plats.length ? plats : [...PLATFORMS], picked: {}, launched: false };
    campaignSettings.set(project.id, JSON.stringify(s));
  }
  const { runId } = startRun(project.id, SITE_TRIGGER);
  const res = json({ projectId: project.id, runId }, 202);
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}
