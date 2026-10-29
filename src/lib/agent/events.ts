import { EventEmitter } from "node:events";
import type { CallRow, LogRow, RunRow, TaskRow } from "@/lib/db/repo";

/** Live board events. The SSE route replays state from the DB on connect, then follows this bus. */
export type BoardEvent =
  | { type: "run"; run: RunRow }
  | { type: "task"; task: TaskRow }
  | { type: "call_start"; runId: string; tool: string; args: unknown; competitor: string | null; filledBy: "llm" | "code" }
  | { type: "call"; call: Omit<CallRow, "result_json"> }
  | { type: "log"; log: LogRow }
  | { type: "package"; runId: string; competitor: string }
  | { type: "end"; runId: string; status: string };

const g = globalThis as unknown as { __adflankBus?: EventEmitter };
export const bus: EventEmitter = (g.__adflankBus ??= new EventEmitter().setMaxListeners(200));

export function emit(projectId: number, ev: BoardEvent): void {
  bus.emit(`project:${projectId}`, ev);
}

export function subscribe(projectId: number, fn: (ev: BoardEvent) => void): () => void {
  const key = `project:${projectId}`;
  bus.on(key, fn);
  return () => bus.off(key, fn);
}
