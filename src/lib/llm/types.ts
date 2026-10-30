/** OpenAI-compatible chat shapes (the subset AdFlank uses). */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  purpose: "planner" | "market" | "worker" | "copy" | "chat";
  messages: ChatMessage[];
  tools?: ToolDef[];
  json?: boolean;
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  /** Model that actually answered (after any fallback). */
  model: string;
  /** Set when a fallback model answered instead of the configured one. */
  fallbackReason?: string;
  /** True when every attempt came back empty or failed; the caller must use its labelled deterministic fallback. */
  empty: boolean;
  error?: string;
}

export interface LlmClient {
  readonly mode: "live" | "mock";
  readonly configuredModel: string;
  chat(req: ChatRequest): Promise<ChatResult>;
  /** Model that answered most recently (shown in the UI and run log). */
  lastModel(): string;
}
