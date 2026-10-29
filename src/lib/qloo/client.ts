import { liveQlooClient } from "./mcp";
import { MockQlooClient } from "./mock";
import type { QlooClient } from "./types";

let override: QlooClient | null = null;
let mock: MockQlooClient | null = null;

/** Live harness when a key is configured, otherwise the synthetic mock (labelled "mock" in the UI). */
export function getQloo(): QlooClient {
  if (override) return override;
  if (process.env.QLOO_MODE === "mock" || !process.env.QLOO_API_KEY) {
    mock ??= new MockQlooClient();
    return mock;
  }
  return liveQlooClient();
}

export function qlooMode(): "live" | "mock" {
  return getQloo().mode;
}

/** Tests and scripts only. */
export function setQloo(client: QlooClient | null): void {
  override = client;
}
