import { describe, expect, it } from "vitest";
import { buildSegments, POOL_SEGMENTS } from "@/lib/campaign/segments";
import { budgetAt, defaultSettings, planCampaigns, restoreSettings, runsFor, settingsSchema, SLIDER } from "@/lib/campaign/plan";
import { SYNTHETIC_PACKAGE } from "@/lib/ads/fixtures/synthetic";

const pool = buildSegments([SYNTHETIC_PACKAGE], "Juniper Roasters", undefined, undefined, POOL_SEGMENTS);

describe("campaign plan", () => {
  it("maps the slider to $10..$1,000 a day and more budget to more campaigns", () => {
    expect(budgetAt(0)).toBe(10);
    expect(budgetAt(SLIDER / 2)).toBe(100);
    expect(budgetAt(SLIDER)).toBe(1000);
    expect([10, 25, 50, 100, 250, 500, 1000].map(runsFor)).toEqual([2, 3, 4, 5, 7, 9, 12]);
    expect(runsFor(240)).toBe(5);
  });

  it("defaults to $100 a day and the first segments of the pool", () => {
    const s = defaultSettings(pool);
    expect(settingsSchema.safeParse(s).success).toBe(true);
    expect(budgetAt(s.pos)).toBe(100);
    expect(s.active).toEqual(pool.slice(0, 5).map((_, n) => n));
  });

  it("rejects bad stored settings and drops segments the pool no longer has", () => {
    expect(restoreSettings({ v: 1, pos: 5000 }, pool)).toEqual(defaultSettings(pool));
    expect(restoreSettings("nonsense", pool)).toEqual(defaultSettings(pool));
    const kept = restoreSettings({ ...defaultSettings(pool), active: [0, 19], retired: [18] }, pool);
    expect(kept.active).toEqual([0]);
    expect(kept.retired).toEqual([]);
    expect(settingsSchema.safeParse({ ...defaultSettings(pool), extra: 1 }).success).toBe(false);
  });

  it("reach grows with budget and paused age bands drop out", () => {
    const s = defaultSettings(pool);
    const low = planCampaigns(pool, { ...s, pos: 0 });
    const high = planCampaigns(pool, { ...s, pos: SLIDER });
    expect(high.total).toBeGreaterThan(low.total);
    const none = planCampaigns(pool, { ...s, ages: [] });
    expect(none.live.length).toBe(0);
    expect(none.total).toBe(0);
  });
});
