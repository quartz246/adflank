import { guard, json } from "@/lib/auth/session";
import { runs } from "@/lib/db/repo";
import { startRun } from "@/lib/agent/run";
import { runState } from "@/lib/agent/views";
import { isDemoUser } from "@/lib/demo";
import { activeRunFor } from "@/lib/agent/run";
import { allowRun, clientIp } from "@/lib/limits";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const g = await guard(req, (await ctx.params).id);
  if ("error" in g) return g.error;
  const runId = new URL(req.url).searchParams.get("run") ?? runs.lastForProject(g.project!.id)?.id;
  const run = runId ? runs.byId(runId) : undefined;
  if (!run || run.project_id !== g.project!.id) return json({ state: null });
  return json({ state: runState(run.id) });
}

/** Start a run now (one at a time; a project never has two in flight). */
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(req, (await ctx.params).id);
  if ("error" in g) return g.error;
  const existing = activeRunFor(g.project!.id);
  if (existing) return json({ runId: existing, reused: true });
  const lim = allowRun(g.user.id, clientIp(req), isDemoUser(g.user));
  if (!lim.ok) return json({ error: lim.message }, 429);
  const { runId, reused } = startRun(g.project!.id, "manual");
  return json({ runId, reused }, reused ? 200 : 202);
}
