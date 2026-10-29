import { guard, json } from "@/lib/auth/session";
import { calls, projects, runs } from "@/lib/db/repo";
import { safeJson } from "@/lib/agent/views";
import { sanitizeDeep } from "@/lib/util/sanitize";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ cite: string }> };

/** One cited Qloo call (slimmed data), only for the owner of its project. */
export async function GET(req: Request, ctx: Ctx) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const cite = (await ctx.params).cite;
  if (!/^q_[a-z0-9]{6,32}_\d{1,4}$/.test(cite)) return json({ error: "not found" }, 404);
  const c = calls.byCite(cite);
  const run = c ? runs.byId(c.run_id) : undefined;
  if (!c || !run || !projects.owned(run.project_id, g.user.id)) return json({ error: "not found" }, 404);
  return json(sanitizeDeep({ ...c, args: safeJson(c.args_json), result: safeJson(c.result_json), args_json: undefined, result_json: undefined }));
}
