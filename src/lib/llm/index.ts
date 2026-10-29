import { GlmClient, llmKey, DEFAULT_BASE_URL, DEFAULT_FALLBACKS, DEFAULT_MODEL } from "./glm";
import { MockLlm } from "./mock";
import type { LlmClient } from "./types";

let singleton: LlmClient | null = null;

/** GLM when a key is configured, otherwise the labelled mock. */
export function getLlm(): LlmClient {
  if (singleton) return singleton;
  const key = llmKey();
  if (process.env.LLM_MODE === "mock" || !key) {
    singleton = new MockLlm();
  } else {
    singleton = new GlmClient({
      apiKey: key,
      baseUrl: process.env.LLM_BASE_URL || DEFAULT_BASE_URL,
      model: process.env.LLM_MODEL || DEFAULT_MODEL,
      fallbacks: process.env.LLM_FALLBACK_MODELS ? process.env.LLM_FALLBACK_MODELS.split(",").map((s) => s.trim()) : DEFAULT_FALLBACKS,
      thinking: process.env.LLM_THINKING === "enabled" ? "enabled" : process.env.LLM_THINKING === "disabled" ? "disabled" : "auto",
    });
  }
  return singleton;
}

/** Tests and scripts only. */
export function setLlm(client: LlmClient | null): void {
  singleton = client;
}

export type { LlmClient } from "./types";
