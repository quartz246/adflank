import { beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";
import { audit, entities, packages, projects, runs, users } from "@/lib/db/repo";
import { executeRun, newRunId } from "@/lib/agent/run";
import { MockLlm } from "@/lib/llm/mock";
import { MockQlooClient } from "@/lib/qloo/mock";
import { SITE_TRIGGER, stepStates } from "@/lib/agent/wizard";
import { brandName, normaliseSite } from "@/lib/site/read";

describe("website flow", () => {
  beforeAll(() => {
    freshDb();
  });

  it("accepts only public https sites", () => {
    expect(normaliseSite("allbirds.com")).toBe("https://allbirds.com/");
    expect(normaliseSite("http://www.Nike.com/x?y")).toBe("https://www.nike.com/");
    for (const bad of ["localhost", ["10", "0", "0", "1"].join("."), "foo.internal", "file:///etc/passwd", "https://user:pw@x.com", ""]) expect(normaliseSite(bad)).toBeNull();
  });

  it("names the brand from the page", () => {
    expect(brandName("warbyparker.com", "Glasses & Eyeglasses | Warby Parker", "")).toBe("Warby Parker");
    expect(brandName("allbirds.com", "Allbirds: Comfortable, Sustainable Shoes & Apparel", "")).toBe("Allbirds");
    expect(brandName("claimbrand.com", "", "")).toBe("Claimbrand");
    expect(brandName("x.com", "Whatever", "Site Name")).toBe("Site Name");
  });

  it("walks all six steps in order and builds packages (mocks)", async () => {
    const u = users.create("site@example.com", "x");
    const p = projects.create(u.id, "example.com", "US", null);
    projects.update(p.id, { landing_url: "https://example.com/" });
    const id = newRunId();
    runs.create(id, p.id, SITE_TRIGGER, "mock");
    const out = await executeRun(id, p.id, { llm: new MockLlm(), qloo: new MockQlooClient() });
    expect(out.status).toBe("done");
    expect(out.packages).toBe(2);
    expect(stepStates(id).map((s) => s.status)).toEqual(["done", "done", "done", "done", "done", "done"]);
    const ents = entities.forProject(p.id);
    expect(ents.filter((e) => e.role === "competitor" && e.status === "found")).toHaveLength(2);
    expect(packages.forRun(id)).toHaveLength(2);
    // Each phase offered only its own tools: nothing was dropped.
    expect(audit.forRun(id).filter((a) => a.decision === "dropped")).toHaveLength(0);
  }, 30000);

  it("a hostile model cannot call tools outside the current step", async () => {
    const u = users.create("site2@example.com", "x");
    const p = projects.create(u.id, "example.org", "US", null);
    projects.update(p.id, { landing_url: "https://example.org/" });
    const id = newRunId();
    runs.create(id, p.id, SITE_TRIGGER, "mock");
    const out = await executeRun(id, p.id, { llm: new MockLlm({ hostile: true }), qloo: new MockQlooClient() });
    expect(out.status).toBe("done");
    const dropped = audit.forRun(id).filter((a) => a.decision === "dropped");
    expect(dropped.some((d) => d.reason === "not offered in this step")).toBe(true);
    expect(dropped.some((d) => d.tool === "bash")).toBe(true);
  }, 30000);

  it("falls back to big brands with the same buyers when nothing is in Qloo (small B2B brands)", async () => {
    const u = users.create("site3@example.com", "x");
    const p = projects.create(u.id, "unknownbrand.com", "US", null);
    projects.update(p.id, { landing_url: "https://unknownbrand.com/" });
    const id = newRunId();
    runs.create(id, p.id, SITE_TRIGGER, "mock");
    const out = await executeRun(id, p.id, { llm: new MockLlm(), qloo: new MockQlooClient() });
    expect(out.status).toBe("done");
    const comps = entities.forProject(p.id).filter((e) => e.role === "competitor");
    expect(comps.map((c) => c.name).sort()).toEqual(["Brand Alpha", "Brand Beta"]);
    const st = stepStates(id);
    expect(st[1].note).toMatch(/^audience brands/);
    expect(st[4].status).toBe("done");
    expect(st[4].note).toMatch(/strongest tastes/);
  }, 30000);
});
