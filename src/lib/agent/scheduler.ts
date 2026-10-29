import { entities, projects, runs } from "@/lib/db/repo";
import { startRun } from "./run";

export const TICK_MS = 60_000;
const DAY_MS = 24 * 3600_000;
const NEW_PROJECT_GRACE_MS = 2 * 60_000;

const g = globalThis as unknown as { __adflankScheduler?: ReturnType<typeof setInterval> };

/** One scheduler tick: start at most one due daily run, and never while another run is in flight. */
export function tick(now = Date.now()): string | null {
  if (runs.active().length > 0) return null;
  for (const p of projects.scheduled()) {
    const ready = entities.forProject(p.id).some((e) => e.role === "competitor" && e.status === "found");
    if (!ready) continue;
    const last = runs.lastForProject(p.id);
    const due = last ? now - Date.parse(last.started_at) >= DAY_MS : now - Date.parse(p.created_at) >= NEW_PROJECT_GRACE_MS;
    if (!due) continue;
    return startRun(p.id, "schedule").runId;
  }
  return null;
}

export function startScheduler(): void {
  if (process.env.SCHEDULER === "0" || g.__adflankScheduler) return;
  g.__adflankScheduler = setInterval(() => {
    try {
      tick();
    } catch {
      /* a failed tick must not kill the server; the next tick retries */
    }
  }, TICK_MS);
  g.__adflankScheduler.unref?.();
}
