import { guard, json } from "@/lib/auth/session";
import { campaignSettings } from "@/lib/db/repo";
import { settingsSchema } from "@/lib/campaign/plan";
import { isDemoUser } from "@/lib/demo";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Save the owner's campaign choices (budget, segments, levers, designs, launch preview). Owner only; schema-checked. */
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard(req, (await ctx.params).id);
  if ("error" in g) return g.error;
  if (isDemoUser(g.user)) return json({ error: "the shared demo is read-only" }, 403);
  const text = await req.text();
  if (text.length > 4000) return json({ error: "too large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const p = settingsSchema.safeParse(body);
  if (!p.success) return json({ error: "invalid settings" }, 400);
  campaignSettings.set(g.project!.id, JSON.stringify(p.data));
  return json({ ok: true });
}
