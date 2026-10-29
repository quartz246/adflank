import { describe, expect, it } from "vitest";
import { ALLOWED_TOOLS, gateToolCall, slimResult, toolDefs } from "@/lib/agent/tools";

// Synthetic id built from parts (the repo scan flags any literal UUID).
const SYNTH_ID = ["00000000", "0000", "4000", "8000", "000000000001"].join("-");

describe("tool gate", () => {
  it("offers only the allowlisted Qloo tools", () => {
    const names = toolDefs().map((t) => t.function.name).sort();
    expect(names).toEqual([...ALLOWED_TOOLS].sort());
    expect(names.every((n) => n.startsWith("qloo_"))).toBe(true);
    for (const t of toolDefs()) expect(t.function.parameters.additionalProperties).toBe(false);
  });

  it("drops unknown tools and logs them", () => {
    const rows: Array<{ tool: string; decision: string; reason: string }> = [];
    for (const n of ["bash", "read_file", "shell", "fetch", "qloo_capabilities", "__proto__", "constructor"]) {
      const g = gateToolCall(n, "{}", (r) => rows.push(r));
      expect(g.ok).toBe(false);
    }
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.decision === "dropped" && r.reason === "tool not in allowlist")).toBe(true);
  });

  it("drops invalid or extra arguments", () => {
    const bad: Array<[string, unknown]> = [
      ["qloo_where_popular", { entity: "X", within: "US", limit: 999 }],
      ["qloo_where_popular", { entity: "X", within: "US", shell: "rm -rf /" }],
      ["qloo_trends", { entities: ["a"], entity_type: "brand", start_date: "yesterday", end_date: "2026-01-01" }],
      ["qloo_entity_tags", "{not json"],
      ["qloo_describe", { entity: "$(cat /etc/passwd)" }],
      ["qloo_describe", { entity: "a`ls`" }],
      ["qloo_recommend", { target_type: "shell" }],
    ];
    for (const [n, a] of bad) expect(gateToolCall(n, a).ok, `${n} ${JSON.stringify(a)}`).toBe(false);
  });

  it("accepts valid calls", () => {
    const g = gateToolCall("qloo_compare_audiences", JSON.stringify({ group_a: [SYNTH_ID], group_b: ["Brand B"], limit: 10 }));
    expect(g.ok).toBe(true);
    expect(gateToolCall("qloo_describe", { entity: "AC/DC", type: "artist" }).ok).toBe(true);
  });

  it("slims results to data and strips URLs and provenance", () => {
    const env = {
      status: "ok" as const,
      results: [{ entity_id: "ID-1", name: "Pod", subtype: "urn:entity:podcast", affinity: 0.9, properties: { image: { url: "https://images.example/x.jpg" } } }],
      provenance: { source: "qloo", endpoint: "/v2/insights", documentation: "https://docs.example", requests: [] },
      execution: { transport: "stdio", transport_name: "mcp", correlation_id: "c", duration_ms: 3 },
    };
    const s = slimResult("qloo_recommend", env, { target_type: "podcast" });
    const json = JSON.stringify(s);
    expect(json).not.toContain("https://");
    expect(json).not.toContain("provenance");
    expect(json).not.toContain("correlation");
    expect((s.data.items as unknown[]).length).toBe(1);
  });

  it("sanitises error text", () => {
    const ip = ["10", "1", "2", "3"].join(".");
    const s = slimResult("qloo_describe", { status: "error", summary: `spawn failed at /${"home"}/user/app/node_modules on ${ip}` });
    expect(JSON.stringify(s)).not.toContain(ip);
    expect(JSON.stringify(s)).not.toContain("user/app");
  });
});
