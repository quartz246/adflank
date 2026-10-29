import { z } from "zod";
import { guard, json } from "@/lib/auth/session";
import { entities } from "@/lib/db/repo";
import { pickCandidate, type Candidate } from "@/lib/agent/resolve";
import { isDemoUser } from "@/lib/demo";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; eid: string }> };
const body = z.object({ candidateId: z.string().min(1).max(60) }).strict();

function owned(projectId: number, eid: string) {
  const e = entities.byId(Number(eid));
  return e && e.project_id === projectId ? e : undefined;
}

/** Pick one of the Qloo candidates offered for a not-found or ambiguous name. */
export async function POST(req: Request, ctx: Ctx) {
  const { id, eid } = await ctx.params;
  const g = await guard(req, id);
  if ("error" in g) return g.error;
  if (isDemoUser(g.user)) return json({ error: "The shared demo project is read-only. Sign up (instant, free) to make your own." }, 403);
  const e = owned(g.project!.id, eid);
  if (!e) return json({ error: "not found" }, 404);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid input" }, 400);
  const cands = (e.candidates_json ? JSON.parse(e.candidates_json) : []) as Candidate[];
  const c = cands.find((x) => x.id === p.data.candidateId);
  if (!c) return json({ error: "Pick one of the offered candidates." }, 400);
  pickCandidate(e.id, c);
  return json({ entity: entities.byId(e.id) });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id, eid } = await ctx.params;
  const g = await guard(req, id);
  if ("error" in g) return g.error;
  if (isDemoUser(g.user)) return json({ error: "The shared demo project is read-only. Sign up (instant, free) to make your own." }, 403);
  const e = owned(g.project!.id, eid);
  if (!e) return json({ error: "not found" }, 404);
  entities.remove(e.id);
  return json({ ok: true });
}
