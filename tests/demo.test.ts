import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";
import { packages, projects, runs } from "@/lib/db/repo";
import { DEMO_SEED, MAX_SEED_RUNS, ensureDemo } from "@/lib/demo";
import type { AttackPackage } from "@/lib/types/attack";

describe("demo seed (DEMO=1, mocks)", () => {
  beforeAll(() => {
    freshDb();
    process.env.DEMO = "1";
  });
  afterAll(() => {
    process.env.DEMO = "0";
  });

  it("seeds two completed runs, and the second compares with the first", async () => {
    const d = (await ensureDemo())!;
    await d.seeded;
    const done = runs.forProject(d.projectId).filter((r) => r.status === "done");
    expect(done.map((r) => r.trigger).sort()).toEqual(["seed", "seed-2"]);
    const second = done.find((r) => r.trigger === "seed-2")!;
    const pk = packages.forRun(second.id).map((r) => JSON.parse(r.package_json) as AttackPackage);
    expect(pk.length).toBe(DEMO_SEED.competitors.length);
    for (const p of pk) {
      expect(p.vsLastRun?.previousRunId).toBe(done.find((r) => r.trigger === "seed")!.id);
      expect(p.vsLastRun?.changes).toBeDefined();
    }
    expect(projects.byId(d.projectId)?.landing_url).toBe(DEMO_SEED.landingUrl);
  });

  it("is idempotent: no new seed run once both are done", async () => {
    const d = (await ensureDemo())!;
    await d.seeded;
    const all = runs.forProject(d.projectId);
    expect(all.length).toBe(2);
    expect(all.length).toBeLessThanOrEqual(MAX_SEED_RUNS);
  });
});
