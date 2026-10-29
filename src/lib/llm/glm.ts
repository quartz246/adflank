import type { ChatRequest, ChatResult, LlmClient, ToolCall } from "./types";

/**
 * GLM over Z.ai's OpenAI-compatible API. fetch only, no SDK. GLM sees nothing but the messages and the
 * allowlisted tool definitions we send; it has no shell, file, browser or network access.
 */
export const DEFAULT_BASE_URL = "https://api.z.ai/api/coding/paas/v4";
export const DEFAULT_MODEL = "glm-5.3-flash";
export const DEFAULT_FALLBACKS = ["glm-4.7-flash", "glm-4.5-flash"];
const REQUEST_TIMEOUT_MS = 120_000;
const PRIMARY_COOLDOWN_MS = 10 * 60_000;

export function llmKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.GLM_API_KEY || env.ZAI_API_KEY || undefined;
}

export interface GlmOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fallbacks?: string[];
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** "auto": switch thinking off where the model allows it (glm-4.x); glm-5.x always thinks and rejects "disabled" (1210). */
  thinking?: "auto" | "enabled" | "disabled";
}

/** Models that always reason: they reject thinking:{type:"disabled"} and need room for reasoning tokens. */
export const alwaysThinks = (model: string) => /^glm-5/i.test(model);

interface ApiError {
  status: number;
  code?: string;
  message: string;
}

/** Errors that move us to the next model: no balance (1113), rate/overload (429, 1302, 1305) and server errors. */
export function isFallbackError(e: ApiError): boolean {
  return e.code === "1113" || e.status === 429 || e.status >= 500 || e.code === "1302" || e.code === "1305" || e.code === "1210" || e.code === "1211";
}

export class GlmClient implements LlmClient {
  readonly mode = "live" as const;
  readonly configuredModel: string;
  private readonly baseUrl: string;
  private readonly key: string;
  private readonly fallbacks: string[];
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly thinking: "auto" | "enabled" | "disabled";
  private last: string;
  private primaryDownUntil = 0;
  private primaryDownReason = "";

  constructor(opts: GlmOptions) {
    this.key = opts.apiKey;
    this.baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.configuredModel = opts.model || DEFAULT_MODEL;
    this.fallbacks = (opts.fallbacks ?? DEFAULT_FALLBACKS).filter((m) => m && m !== this.configuredModel);
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.thinking = opts.thinking ?? "auto";
    this.last = this.configuredModel;
  }

  lastModel(): string {
    return this.last;
  }

  private async once(model: string, req: ChatRequest): Promise<{ ok: true; content: string; toolCalls: ToolCall[] } | { ok: false; err: ApiError }> {
    const thinks = alwaysThinks(model);
    const body: Record<string, unknown> = {
      model,
      messages: req.messages,
      // Reasoning tokens count against max_tokens: give always-thinking models more room so content is not empty.
      max_tokens: thinks ? Math.max(req.maxTokens ?? 4096, 8192) : (req.maxTokens ?? 4096),
      temperature: 0.4,
    };
    if (this.thinking === "enabled") body.thinking = { type: "enabled" };
    else if (!thinks) body.thinking = { type: "disabled" };
    if (req.tools?.length) {
      body.tools = req.tools;
      body.tool_choice = "auto";
    }
    // response_format is rejected by some GLM models (400/1210); prompts ask for JSON and callers parse it leniently.
    if (req.json && process.env.LLM_JSON_MODE === "1") body.response_format = { type: "json_object" };
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      return { ok: false, err: { status: 599, message: e instanceof Error ? e.name : "network error" } };
    }
    const text = await res.text();
    let j: { error?: { code?: string | number; message?: string }; choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }> } | null = null;
    try {
      j = JSON.parse(text);
    } catch {
      j = null;
    }
    if (!res.ok || j?.error) {
      return { ok: false, err: { status: res.status, code: j?.error?.code !== undefined ? String(j.error.code) : undefined, message: String(j?.error?.message ?? `HTTP ${res.status}`).slice(0, 200) } };
    }
    const msg = j?.choices?.[0]?.message;
    const toolCalls = (msg?.tool_calls ?? []).filter((t) => t && t.function && typeof t.function.name === "string");
    return { ok: true, content: typeof msg?.content === "string" ? msg.content : "", toolCalls };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const primaryDown = Date.now() < this.primaryDownUntil;
    const chain = primaryDown ? this.fallbacks : [this.configuredModel, ...this.fallbacks];
    let fallbackReason: string | undefined = primaryDown ? this.primaryDownReason : undefined;
    let lastErr = "";
    for (const model of chain) {
      let emptyTries = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await this.once(model, req);
        if (r.ok) {
          if (!r.content.trim() && r.toolCalls.length === 0) {
            // Flash models can spend the token budget on reasoning: retry once, then give up on this model.
            emptyTries++;
            if (emptyTries >= 2) {
              lastErr = "empty content";
              break;
            }
            continue;
          }
          this.last = model;
          return { content: r.content, toolCalls: r.toolCalls, model, fallbackReason, empty: false };
        }
        lastErr = `${r.err.status}${r.err.code ? `/${r.err.code}` : ""}`;
        if (r.err.code === "1113") {
          if (model === this.configuredModel) {
            this.primaryDownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
            this.primaryDownReason = `${model} unavailable (Z.ai 1113 insufficient balance)`;
          }
          fallbackReason = `${model} unavailable (Z.ai 1113 insufficient balance)`;
          break;
        }
        if (!isFallbackError(r.err)) return { content: "", toolCalls: [], model, fallbackReason, empty: true, error: lastErr };
        if (r.err.code === "1210" || r.err.code === "1211") {
          // Model-specific parameter or model-name error: retrying the same model will not help.
          fallbackReason = `${model} rejected the request (${lastErr})`;
          break;
        }
        fallbackReason = `${model} unavailable (${lastErr})`;
        // Overload/rate limit: back off and retry the same model, then move on.
        if (attempt < 2) await this.sleep(2000 * (attempt + 1));
      }
    }
    return { content: "", toolCalls: [], model: chain[chain.length - 1] ?? this.configuredModel, fallbackReason, empty: true, error: lastErr || "no model answered" };
  }
}
