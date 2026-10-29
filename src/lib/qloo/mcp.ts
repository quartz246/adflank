import path from "node:path";
import { mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { QlooClient, QlooEnvelope, QlooToolSchema } from "./types";

const CALL_TIMEOUT_MS = 45_000;

/** Hackathon keys only work against this host (staging/production return 401). */
export const HACKATHON_BASE_URL = "https://hackathon.api.qloo.com";

/** The only variables the Qloo subprocess may see. The LLM key is never among them. */
export const QLOO_CHILD_ENV_KEYS = [
  "QLOO_API_KEY",
  "QLOO_BASE_URL",
  "QLOO_TRUSTED_BASE_URL",
  "QLOO_HOME",
  "PATH",
  "HOME",
  "NODE_ENV",
  "LANG",
] as const;

/** Build the subprocess environment from an explicit allowlist (never a copy of process.env). */
export function qlooChildEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of QLOO_CHILD_ENV_KEYS) {
    const v = source[k];
    if (typeof v === "string" && v !== "") env[k] = v;
  }
  env.QLOO_HOME = env.QLOO_HOME || path.resolve(process.cwd(), ".qloo-home");
  // Default to the hackathon host; the harness only accepts a non-production host if it is also marked trusted.
  env.QLOO_BASE_URL = env.QLOO_BASE_URL || HACKATHON_BASE_URL;
  env.QLOO_TRUSTED_BASE_URL = env.QLOO_TRUSTED_BASE_URL || env.QLOO_BASE_URL;
  return env;
}

/**
 * Live Qloo access through the official event harness: we start `qloo mcp`
 * (from @qloo/qloo-harness) as a stdio MCP server and call its validated workflows.
 * The key never reaches the browser or the LLM.
 */
export class HarnessMcpQlooClient implements QlooClient {
  readonly mode = "live" as const;
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  private binPath(): string {
    return process.env.QLOO_HARNESS_BIN ?? path.resolve(process.cwd(), "node_modules/@qloo/qloo-harness/dist/bin.js");
  }

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const env = qlooChildEnv();
      mkdirSync(env.QLOO_HOME, { recursive: true });
      const transport = new StdioClientTransport({ command: process.execPath, args: [this.binPath(), "mcp"], env, stderr: "pipe" });
      const client = new Client({ name: "adflank", version: "0.1.0" });
      transport.onclose = () => {
        this.client = null;
      };
      await client.connect(transport);
      this.client = client;
      return client;
    })();
    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async tools(): Promise<QlooToolSchema[]> {
    const client = await this.connect();
    const { tools } = await client.listTools();
    return tools
      .filter((t) => t.name !== "qloo_capabilities")
      .map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown> }));
  }

  async readiness(): Promise<boolean> {
    const client = await this.connect();
    const cap = await client.callTool({ name: "qloo_capabilities", arguments: {} });
    const sc = cap.structuredContent as { adapter?: { ready?: boolean } } | undefined;
    return Boolean(sc?.adapter?.ready);
  }

  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<QlooEnvelope> {
    try {
      const client = await this.connect();
      const res = await client.callTool({ name, arguments: args }, undefined, { signal, timeout: CALL_TIMEOUT_MS });
      return toEnvelope(res as { structuredContent?: unknown; content?: unknown; isError?: boolean });
    } catch (err) {
      return {
        status: "error",
        operation: name.replace(/^qloo_/, ""),
        summary: err instanceof Error ? err.message : String(err),
        results: [],
        result_count: 0,
        error: { code: "TOOL_CALL_FAILED", retryable: false, recovery: "Check the tool arguments." },
      };
    }
  }

  async close(): Promise<void> {
    const c = this.client;
    this.client = null;
    if (c) await c.close().catch(() => undefined);
  }
}

export function toEnvelope(res: { structuredContent?: unknown; content?: unknown; isError?: boolean }): QlooEnvelope {
  let env = res.structuredContent as QlooEnvelope | undefined;
  if (!env && Array.isArray(res.content)) {
    const text = (res.content as Array<{ type: string; text?: string }>).find((c) => c.type === "text")?.text;
    if (text) {
      try {
        env = JSON.parse(text) as QlooEnvelope;
      } catch {
        env = { status: res.isError ? "error" : "ok", summary: text } as QlooEnvelope;
      }
    }
  }
  if (!env) return { status: "error", summary: "Empty tool result", error: { code: "UNKNOWN", retryable: false, recovery: "" } };
  if (env.status === undefined) return { ...env, status: "error", error: { code: "UNKNOWN", retryable: false, recovery: "", ...(env.error ?? {}) } };
  return env;
}

let singleton: HarnessMcpQlooClient | null = null;
export function liveQlooClient(): HarnessMcpQlooClient {
  singleton ??= new HarnessMcpQlooClient();
  return singleton;
}
