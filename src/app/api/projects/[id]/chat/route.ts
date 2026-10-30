import { isGuestUser } from "@/lib/auth/session";
import { z } from "zod";
import { guard, json } from "@/lib/auth/session";
import { bossChat } from "@/lib/agent/chat";
import { chat } from "@/lib/db/repo";
import { currentSessionHash } from "@/lib/auth/session";
import { isDemoUser } from "@/lib/demo";
import { allow, allowRun, clientIp } from "@/lib/limits";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ message: z.string().trim().min(1).max(1000) }).strict();

export async function GET(req: Request, ctx: Ctx) {
  const g = await guard(req, (await ctx.params).id);
  if ("error" in g) return g.error;
  if (isGuestUser(g.user)) return json({ error: "Create a free account to open the project and chat with the Agent." }, 401);
  const scope = isDemoUser(g.user) ? await currentSessionHash() : undefined;
  return json({ messages: chat.forProject(g.project!.id, 50, scope) });
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(req, (await ctx.params).id);
  if ("error" in g) return g.error;
  if (isGuestUser(g.user)) return json({ error: "Create a free account to open the project and chat with the Agent." }, 401);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "Write a message (up to 1000 characters)." }, 400);
  const demo = isDemoUser(g.user);
  const scope = demo ? await currentSessionHash() : undefined;
  const lim = allow("chat", scope ?? String(g.user.id));
  if (!lim.ok) return json({ error: lim.message }, 429);
  const ip = clientIp(req);
  const out = await bossChat(g.project!.id, p.data.message, { sessionHash: scope, canRun: () => allowRun(g.user.id, ip, demo) });
  return json({ reply: out.reply, model: out.model, runId: out.runId ?? null });
}
