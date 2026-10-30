import { guard, json } from "@/lib/auth/session";
import { wizardView } from "@/lib/agent/wizard-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Everything the website-flow page shows, for the project's latest run (polled on every board event). */
export async function GET(req: Request, ctx: Ctx) {
  const g = await guard(req, (await ctx.params).id);
  if ("error" in g) return g.error;
  return json(wizardView(g.project!, g.user));
}
