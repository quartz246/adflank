import { describe, expect, it } from "vitest";
import { qlooChildEnv, QLOO_CHILD_ENV_KEYS, HACKATHON_BASE_URL } from "@/lib/qloo/mcp";

describe("Qloo subprocess env", () => {
  it("passes only the allowlisted variables and never the LLM key", () => {
    const env = qlooChildEnv({ QLOO_API_KEY: "q", GLM_API_KEY: "g", ZAI_API_KEY: "z", KAGGLE_KEY: "k", PATH: "/bin", HOME: "/x", SECRET: "s" } as unknown as NodeJS.ProcessEnv);
    expect(env.QLOO_API_KEY).toBe("q");
    expect(env).not.toHaveProperty("GLM_API_KEY");
    expect(env).not.toHaveProperty("ZAI_API_KEY");
    expect(env).not.toHaveProperty("KAGGLE_KEY");
    expect(env).not.toHaveProperty("SECRET");
    for (const k of Object.keys(env)) expect(QLOO_CHILD_ENV_KEYS as readonly string[]).toContain(k);
    expect(env.QLOO_BASE_URL).toBe(HACKATHON_BASE_URL);
  });
});
