// Shapes of the Qloo harness workflow envelope (result_schema_version 1.0-preview.1).
// See https://github.com/qloo/qloo-hackathon-kit/blob/main/starter/mcp-client/README.md

export type QlooStatus = "ok" | "empty" | "needs_input" | "partial" | "degraded" | "error";

export interface QlooEntity {
  entity_id?: string;
  name?: string;
  type?: string;
  subtype?: string;
  popularity?: number;
  affinity?: number;
  explainability?: unknown;
  properties?: Record<string, unknown>;
}

export interface QlooTag {
  id?: string;
  name?: string;
  type?: string;
  popularity?: number;
  affinity?: number;
}

export interface QlooResolutionIssue {
  input: string;
  kind: string;
  input_kind?: "entity" | "tag";
  field?: string;
  candidates?: Array<{ id?: string; name?: string; type?: string; score?: number; [k: string]: unknown }>;
}

export interface QlooProvenance {
  source: string;
  endpoint: string;
  documentation: string;
  requests?: Array<{ method: string; path: string; query: unknown }>;
}

export interface QlooEnvelope {
  schema_version?: string;
  operation?: string;
  status: QlooStatus;
  summary?: string;
  interpretation?: unknown;
  results?: unknown;
  result_count?: number;
  warnings?: string[];
  resolution?: { issues?: QlooResolutionIssue[]; [k: string]: unknown };
  error?: { code: string; layer?: string; retryable: boolean; recovery: string };
  provenance?: QlooProvenance;
  execution?: { transport: string; transport_name: string; correlation_id: string; duration_ms: number };
  [k: string]: unknown;
}

export interface QlooToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export type DataMode = "live" | "mock";

export interface QlooClient {
  readonly mode: DataMode;
  tools(): Promise<QlooToolSchema[]>;
  call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<QlooEnvelope>;
}

export function resultsArray<T = QlooEntity>(env: QlooEnvelope): T[] {
  return Array.isArray(env.results) ? (env.results as T[]) : [];
}
