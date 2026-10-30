import { entities, projects, runs, users, type UserRow } from "@/lib/db/repo";
import { startRun } from "@/lib/agent/run";
import { checkEntity } from "@/lib/agent/check";

/**
 * Shared judge/demo account: one click from the landing page, no password. Its seeded project already
 * shows two completed runs (started on first boot, the second right after the first), so "vs last run" is
 * visible from day one. The seeded project is read-only; chat history is per session.
 */
export const DEMO_EMAIL = "demo@adflank.invalid";
export const DEMO_SEED = {
  brand: "Allbirds",
  competitors: ["Nike", "Adidas"],
  country: "US",
  name: "Demo: Allbirds vs Nike, Adidas",
  landingUrl: "https://www.allbirds.com/",
  runs: ["seed", "seed-2"],
};
/** Hard cap on seed runs per demo project, failed ones included, so a failing Qloo or LLM cannot loop. */
export const MAX_SEED_RUNS = 4;

/** The shared demo account is off unless DEMO=1 is set explicitly. */
export const demoEnabled = () => process.env.DEMO === "1";
export const isDemoUser = (u: UserRow | undefined) => Boolean(u && u.email === DEMO_EMAIL);

export function demoUser(): UserRow {
  return users.byEmail(DEMO_EMAIL) ?? users.create(DEMO_EMAIL, "!demo-no-password");
}

const g = globalThis as unknown as { __adflankSeeding?: Promise<void> };

/** Start the seed runs that have not finished yet, one after the other. */
async function seedRuns(projectId: number): Promise<void> {
  for (;;) {
    const all = runs.forProject(projectId, 50);
    const next = DEMO_SEED.runs.find((t) => !all.some((r) => r.trigger === t && r.status === "done"));
    if (!next) return;
    if (all.filter((r) => DEMO_SEED.runs.includes(r.trigger)).length >= MAX_SEED_RUNS) return;
    const started = startRun(projectId, next);
    // Another run of this project is in flight: the next ensureDemo() call picks the chain up again.
    if (started.reused) return;
    await started.done;
  }
}

/**
 * Create the demo project if missing and start its seed runs (DEMO_SEED.runs, in order) until each has
 * finished once. Idempotent; `seeded` resolves when no seed run is left to start.
 */
export async function ensureDemo(): Promise<{ projectId: number; runId?: string; seeded: Promise<void> } | null> {
  if (!demoEnabled()) return null;
  const u = demoUser();
  let p = projects.forUser(u.id).find((x) => x.name === DEMO_SEED.name);
  if (!p) {
    p = projects.create(u.id, DEMO_SEED.name, DEMO_SEED.country, null);
    const added = [entities.add(p.id, "brand", DEMO_SEED.brand), ...DEMO_SEED.competitors.map((c) => entities.add(p!.id, "competitor", c))];
    for (const e of added) await checkEntity(e).catch(() => undefined);
  }
  if (!p.landing_url) projects.update(p.id, { landing_url: DEMO_SEED.landingUrl });
  const projectId = p.id;
  g.__adflankSeeding ??= seedRuns(projectId)
    .catch(() => undefined)
    .finally(() => {
      g.__adflankSeeding = undefined;
    });
  const seeded = g.__adflankSeeding;
  return { projectId, runId: runs.lastForProject(projectId)?.id, seeded };
}

/** The seeded demo project cannot be edited or deleted by visitors. */
export function demoReadOnly(user: UserRow | undefined): boolean {
  return isDemoUser(user);
}
