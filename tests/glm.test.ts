import { describe, expect, it } from "vitest";
import { GlmClient } from "@/lib/llm/glm";

function fakeFetch(script: Array<{ status: number; body: unknown }>) {
  const seen: string[] = [];
  const f = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    seen.push(body.model);
    const next = script.shift() ?? { status: 500, body: { error: { code: "500", message: "x" } } };
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as unknown as typeof fetch;
  return { f, seen };
}
const ok = (content: string, tool_calls?: unknown) => ({ status: 200, body: { choices: [{ message: { content, tool_calls } }] } });
const sleep = async () => undefined;

describe("GlmClient", () => {
  it("falls back to glm-4.7-flash on 1113 and reports the model that ran", async () => {
    const { f, seen } = fakeFetch([{ status: 429, body: { error: { code: "1113", message: "Insufficient balance" } } }, ok("hello")]);
    const c = new GlmClient({ apiKey: "k", fetchImpl: f, sleep });
    const r = await c.chat({ purpose: "chat", messages: [{ role: "user", content: "hi" }] });
    expect(r.model).toBe("glm-4.7-flash");
    expect(r.content).toBe("hello");
    expect(r.fallbackReason).toMatch(/1113/);
    expect(seen).toEqual(["glm-5.3-flash", "glm-4.7-flash"]);
    // primary is skipped for a while after 1113
    const { f: f2 } = fakeFetch([ok("again")]);
    (c as unknown as { fetchImpl: typeof fetch }).fetchImpl = f2;
    const r2 = await c.chat({ purpose: "chat", messages: [{ role: "user", content: "hi" }] });
    expect(r2.model).toBe("glm-4.7-flash");
  });

  it("retries an empty answer once, then moves on, then gives a labelled empty result", async () => {
    const { f, seen } = fakeFetch([ok(""), ok(""), ok(""), ok(""), ok(""), ok("")]);
    const c = new GlmClient({ apiKey: "k", fetchImpl: f, sleep, fallbacks: ["glm-4.7-flash"] });
    const r = await c.chat({ purpose: "chat", messages: [{ role: "user", content: "hi" }] });
    expect(r.empty).toBe(true);
    expect(seen).toEqual(["glm-5.3-flash", "glm-5.3-flash", "glm-4.7-flash", "glm-4.7-flash"]);
  });

  it("backs off on overload (1305) and falls through the chain", async () => {
    const busy = { status: 429, body: { error: { code: "1305", message: "overloaded" } } };
    const { f, seen } = fakeFetch([ok("primary ok")]);
    const c = new GlmClient({ apiKey: "k", fetchImpl: f, sleep });
    expect((await c.chat({ purpose: "chat", messages: [{ role: "user", content: "x" }] })).model).toBe("glm-5.3-flash");
    const { f: f2, seen: s2 } = fakeFetch([busy, busy, busy, ok("second")]);
    const c2 = new GlmClient({ apiKey: "k", fetchImpl: f2, sleep });
    const r = await c2.chat({ purpose: "chat", messages: [{ role: "user", content: "x" }] });
    expect(r.model).toBe("glm-4.7-flash");
    expect(s2).toEqual(["glm-5.3-flash", "glm-5.3-flash", "glm-5.3-flash", "glm-4.7-flash"]);
    expect(seen).toEqual(["glm-5.3-flash"]);
  });

  it("never sends thinking:disabled to glm-5.x (Z.ai 1210) but does for glm-4.x", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const f = (async (_u: string, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body));
      bodies.push(b);
      if (b.model === "glm-5.3-flash") return new Response(JSON.stringify({ error: { code: "1113", message: "no balance" } }), { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await new GlmClient({ apiKey: "k", fetchImpl: f, sleep }).chat({ purpose: "chat", messages: [{ role: "user", content: "x" }], maxTokens: 1024 });
    expect(bodies[0].model).toBe("glm-5.3-flash");
    expect(bodies[0]).not.toHaveProperty("thinking");
    expect(bodies[0].max_tokens).toBeGreaterThanOrEqual(8192);
    expect(bodies[1].model).toBe("glm-4.7-flash");
    expect(bodies[1].thinking).toEqual({ type: "disabled" });
  });

  it("parses tool calls", async () => {
    const { f } = fakeFetch([ok("", [{ id: "c1", type: "function", function: { name: "qloo_describe", arguments: "{\"entity\":\"X\"}" } }])]);
    const c = new GlmClient({ apiKey: "k", fetchImpl: f, sleep });
    const r = await c.chat({ purpose: "worker", messages: [{ role: "user", content: "x" }] });
    expect(r.toolCalls[0].function.name).toBe("qloo_describe");
    expect(r.empty).toBe(false);
  });

  it("sends the key only in the Authorization header, never in the body", async () => {
    let body = "";
    let auth = "";
    const f = (async (_u: string, init?: RequestInit) => {
      body = String(init?.body);
      auth = String((init?.headers as Record<string, string>).authorization);
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await new GlmClient({ apiKey: "very-secret-key", fetchImpl: f, sleep }).chat({ purpose: "chat", messages: [{ role: "user", content: "x" }] });
    expect(body).not.toContain("very-secret-key");
    expect(auth).toBe("Bearer very-secret-key");
  });
});
