import { describe, expect, it } from "vitest";
import { diffPackages, listChange } from "@/lib/agent/compose";
import type { AttackPackage, Creator, GapHook, GeoTarget, Trend } from "@/lib/types/attack";

function pkg(run: string, o: { trends?: Trend[]; gap?: GapHook[]; creators?: Creator[]; where?: GeoTarget[] } = {}): AttackPackage {
  const c = (n: number) => `q_${run}_${n}`;
  return {
    runId: run,
    createdAt: "2026-10-29T10:00:00Z",
    brand: { name: "Allbirds", qlooId: "b" },
    competitor: { name: "Nike", qlooId: "n" },
    locale: { countryCodes: ["US"], language: "en" },
    where: o.where ?? [{ city: "Portland", countryCode: "US", score: 0.9, cite: c(2) }, { city: "Denver", countryCode: "US", score: 0.8, cite: c(2) }],
    who: { ages: [], cite: c(3) },
    interests: [],
    creators: o.creators ?? [{ name: "Pod One", kind: "podcast", affinity: 0.9, cite: c(5) }, { name: "Show One", kind: "tv_show", affinity: 0.8, cite: c(6) }],
    gap: o.gap ?? [{ label: "Running", theirs: 0.9, yours: 0.2, delta: 0.7, cite: c(8) }, { label: "Hiking", theirs: 0.6, yours: 0.3, delta: 0.3, cite: c(8) }],
    trends: o.trends ?? [
      { entity: "Allbirds", direction: "rising", changePct: 4, points: 8, latest: 0.6, cite: c(1) },
      { entity: "Nike", direction: "flat", changePct: 0, points: 8, latest: 0.9, cite: c(1) },
    ],
    copyAngles: [],
    citations: {},
  };
}

describe("diffPackages (vs last run)", () => {
  it("reports an unchanged pair as unchanged, with zero moves", () => {
    const v = diffPackages(pkg("r1"), pkg("r2"), "r1", "2026-10-28T10:00:00Z");
    const ch = v.changes!;
    expect(ch.unchanged).toBe(true);
    expect(ch.momentum).toEqual({ now: 4, before: 4, change: 0 });
    expect(ch.trends.map((t) => [t.role, t.deltaPts])).toEqual([["brand", 0], ["competitor", 0]]);
    expect(ch.gap).toMatchObject({ total: 1, prevTotal: 1, change: 0, added: [], dropped: [], moved: [] });
    expect(ch.creators).toEqual({ added: [], dropped: [] });
    expect(ch.where).toEqual({ added: [], dropped: [] });
    expect(v.previousRunId).toBe("r1");
    expect(v.summary).toMatch(/No change since the run at 2026-10-28 10:00 UTC/);
    expect(v.cite).toEqual(expect.arrayContaining(["q_r2_1", "q_r1_1", "q_r2_8", "q_r1_8"]));
  });

  it("captures changed trends, gap tags and creators, with cites from both runs", () => {
    const prev = pkg("r1");
    const cur = pkg("r2", {
      trends: [
        { entity: "Allbirds", direction: "rising", changePct: 9, points: 8, cite: "q_r2_1" },
        { entity: "Nike", direction: "falling", changePct: -3, points: 8, cite: "q_r2_1" },
      ],
      gap: [{ label: "Running", theirs: 0.9, yours: 0.5, delta: 0.4, cite: "q_r2_8" }, { label: "Yoga", theirs: 0.5, yours: 0.1, delta: 0.4, cite: "q_r2_8" }],
      creators: [{ name: "Pod One", kind: "podcast", affinity: 0.9, cite: "q_r2_5" }, { name: "Brand Partner", kind: "brand", affinity: 0.7, cite: "q_r2_7" }],
    });
    const v = diffPackages(prev, cur, "r1");
    const ch = v.changes!;
    expect(ch.unchanged).toBe(false);
    expect(ch.momentum).toEqual({ now: 12, before: 4, change: 8 });
    expect(ch.trends[0]).toMatchObject({ role: "brand", changePct: 9, prevChangePct: 4, deltaPts: 5, cite: "q_r2_1", prevCite: "q_r1_1" });
    expect(ch.trends[1]).toMatchObject({ role: "competitor", direction: "falling", prevDirection: "flat", changePct: -3, deltaPts: -3 });
    expect(ch.gap).toMatchObject({ total: 0.8, prevTotal: 1, change: -0.2, added: ["Yoga"], dropped: ["Hiking"], cite: "q_r2_8", prevCite: "q_r1_8" });
    expect(ch.gap.moved).toEqual([{ label: "Running", delta: 0.4, prevDelta: 0.7, change: -0.3 }]);
    expect(ch.creators).toEqual({ added: ["Brand Partner"], dropped: ["Show One"] });
    expect(v.gainingOn).toBe(true);
    expect(v.summary).toMatch(/new gap tags: Yoga/);
    expect(v.summary).toMatch(/new recommendations: Brand Partner/);
    expect(v.cite).toEqual(expect.arrayContaining(["q_r2_7", "q_r1_1"]));
  });

  it("keeps changePct 0 on a flat trend with no weekly points, and on a missing previous series", () => {
    const prev = pkg("r1", { trends: [{ entity: "Nike", direction: "flat", changePct: 0, points: 8, cite: "q_r1_1" }] });
    const cur = pkg("r2", {
      trends: [
        { entity: "Allbirds", direction: "flat", changePct: 0, points: 0, cite: "q_r2_1" },
        { entity: "Nike", direction: "flat", points: 1, cite: "q_r2_1" },
      ],
    });
    const ch = diffPackages(prev, cur, "r1").changes!;
    expect(ch.trends.map((t) => t.changePct)).toEqual([0, 0]);
    expect(ch.trends[0]).toMatchObject({ role: "brand", prevDirection: undefined, prevChangePct: undefined, deltaPts: 0 });
    expect(ch.trends[1]).toMatchObject({ role: "competitor", prevDirection: "flat", prevChangePct: 0, deltaPts: 0 });
  });

  it("listChange is case-insensitive and keeps list order", () => {
    expect(listChange(["A", "b", "C"], ["B", "d", "a"])).toEqual({ added: ["d"], dropped: ["C"] });
  });
});
