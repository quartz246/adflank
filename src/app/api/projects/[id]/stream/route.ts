import { guard } from "@/lib/auth/session";
import { runs } from "@/lib/db/repo";
import { subscribe, type BoardEvent } from "@/lib/agent/events";
import { runState } from "@/lib/agent/views";
import { sanitizeDeep } from "@/lib/util/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Live board: replays the latest run from the DB on connect, then streams bus events. */
export async function GET(req: Request, ctx: Ctx) {
  const g = await guard(req, (await ctx.params).id);
  if ("error" in g) return g.error;
  const projectId = g.project!.id;
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(sanitizeDeep(data))}\n\n`));
        } catch {
          cleanup();
        }
      };
      const last = runs.lastForProject(projectId);
      send("state", last ? runState(last.id) : null);
      const unsub = subscribe(projectId, (ev: BoardEvent) => {
        if (ev.type === "run" || ev.type === "end") {
          // A new or finished run: resend the full state so the client never drifts.
          const id = ev.type === "run" ? ev.run.id : ev.runId;
          send("state", runState(id));
        } else send(ev.type, ev);
      });
      const ping = setInterval(() => send("ping", Date.now()), 15_000);
      cleanup = () => {
        clearInterval(ping);
        unsub();
        try {
          controller.close();
        } catch {
          /* closed */
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
