import { z } from "zod";
import { guard, json } from "@/lib/auth/session";
import { entities, projects } from "@/lib/db/repo";
import { checkEntity, NAME_RE } from "@/lib/agent/check";
import { COUNTRY_CODES } from "@/lib/geo/cities";
import { isDemoUser } from "@/lib/demo";
import { allow } from "@/lib/limits";
import { cleanLandingUrl } from "@/lib/util/url";

export const runtime = "nodejs";

const name = z.string().trim().min(1).max(80).regex(NAME_RE, "Use letters, numbers and simple punctuation only.");
const body = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    brand: name,
    competitors: z.array(name).min(1).max(5),
    countryCode: z.string().trim().toUpperCase().refine((c) => COUNTRY_CODES.includes(c), "Unsupported country"),
    city: z.string().trim().max(60).regex(/^[\p{L}\p{M} .'’-]*$/u).optional(),
    landingUrl: z.string().trim().max(300).optional(),
  })
  .strict();

export async function GET(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  return json({ projects: projects.forUser(g.user.id) });
}

export async function POST(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  if (isDemoUser(g.user)) return json({ error: "The demo account cannot create projects. Sign up (instant, free) to make your own." }, 403);
  const lim = allow("project", String(g.user.id));
  if (!lim.ok) return json({ error: lim.message }, 429);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.issues[0]?.message ?? "invalid input" }, 400);
  const d = p.data;
  const landing = d.landingUrl ? cleanLandingUrl(d.landingUrl) : null;
  if (d.landingUrl && !landing) return json({ error: "The landing page must be a public https:// address." }, 400);
  const proj = projects.create(g.user.id, d.name || `${d.brand} vs ${d.competitors.join(", ")}`, d.countryCode, d.city || null);
  if (landing) projects.update(proj.id, { landing_url: landing });
  const added = [entities.add(proj.id, "brand", d.brand), ...d.competitors.map((c) => entities.add(proj.id, "competitor", c))];
  const checks = await Promise.all(added.map((e) => checkEntity(e).catch(() => ({ entity: e, candidates: [] }))));
  return json({ project: proj, entities: checks.map((c) => ({ ...c.entity, candidates: c.candidates })) }, 201);
}
