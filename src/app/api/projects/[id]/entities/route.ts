import { z } from "zod";
import { guard, json } from "@/lib/auth/session";
import { entities } from "@/lib/db/repo";
import { checkEntity, NAME_RE } from "@/lib/agent/check";
import { isDemoUser } from "@/lib/demo";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ role: z.enum(["brand", "competitor"]), name: z.string().trim().min(1).max(80).regex(NAME_RE, "Use letters, numbers and simple punctuation only.") }).strict();

/** Add a brand or competitor; checks it in Qloo right away and returns found / not found / candidates. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(req, (await ctx.params).id);
  if ("error" in g) return g.error;
  if (isDemoUser(g.user)) return json({ error: "The shared demo project is read-only. Sign up (instant, free) to make your own." }, 403);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.issues[0]?.message ?? "invalid input" }, 400);
  const list = entities.forProject(g.project!.id);
  if (p.data.role === "competitor" && list.filter((e) => e.role === "competitor").length >= 5) return json({ error: "Up to 5 competitors per project." }, 400);
  if (p.data.role === "brand") for (const e of list.filter((x) => x.role === "brand")) entities.remove(e.id);
  const e = entities.add(g.project!.id, p.data.role, p.data.name);
  const out = await checkEntity(e).catch(() => ({ entity: e, candidates: [] }));
  return json({ entity: { ...out.entity, candidates: out.candidates } }, 201);
}
