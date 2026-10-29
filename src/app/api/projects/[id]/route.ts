import { z } from "zod";
import { guard, json } from "@/lib/auth/session";
import { projects } from "@/lib/db/repo";
import { publicProjectView } from "@/lib/agent/views";
import { COUNTRY_CODES } from "@/lib/geo/cities";
import { isDemoUser } from "@/lib/demo";
import { currentSessionHash } from "@/lib/auth/session";
import { cleanLandingUrl } from "@/lib/util/url";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const g = await guard(req, (await ctx.params).id);
  if ("error" in g) return g.error;
  return json(publicProjectView(g.project!, isDemoUser(g.user) ? await currentSessionHash() : undefined));
}

const patch = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    countryCode: z.string().trim().toUpperCase().refine((c) => COUNTRY_CODES.includes(c)).optional(),
    city: z.string().trim().max(60).regex(/^[\p{L}\p{M} .'’-]*$/u).nullable().optional(),
    scheduleDaily: z.boolean().optional(),
    landingUrl: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(req, (await ctx.params).id);
  if ("error" in g) return g.error;
  if (isDemoUser(g.user)) return json({ error: "The shared demo project is read-only. Sign up (instant, free) to make your own." }, 403);
  const p = patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid input" }, 400);
  const landing = p.data.landingUrl ? cleanLandingUrl(p.data.landingUrl) : p.data.landingUrl === undefined ? undefined : null;
  if (p.data.landingUrl && !landing) return json({ error: "The landing page must be a public https:// address." }, 400);
  if (landing !== undefined) projects.update(g.project!.id, { landing_url: landing });
  projects.update(g.project!.id, { name: p.data.name, country_code: p.data.countryCode, city: p.data.city === undefined ? undefined : p.data.city || null, schedule_daily: p.data.scheduleDaily === undefined ? undefined : p.data.scheduleDaily ? 1 : 0 });
  return json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard(req, (await ctx.params).id);
  if ("error" in g) return g.error;
  if (isDemoUser(g.user)) return json({ error: "The shared demo project is read-only. Sign up (instant, free) to make your own." }, 403);
  projects.delete(g.project!.id);
  return json({ ok: true });
}
