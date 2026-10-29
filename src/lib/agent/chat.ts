import { audit, chat, projects } from "@/lib/db/repo";
import { getLlm } from "@/lib/llm";
import type { LlmClient } from "@/lib/llm/types";
import { chatMessages } from "./prompts";
import { runSummaryForChat } from "./views";
import { startRun, type RunDeps } from "./run";
import { clip, sanitizeText } from "@/lib/util/sanitize";
import { guardChatReply, isRunRequest, RUN_HINT } from "./guard";

export interface ChatReply {
  reply: string;
  model: string;
  runId?: string;
  dropped: number;
}

/**
 * Boss chat. GLM answers from stored run data only; it is offered no tools at all, so any tool call it
 * produces is dropped and audited. Only the server starts runs, and only for a plain run request ("run now");
 * the model can never start one. Every reply passes the output guard (prompt echo, shell-like output, run
 * claims) before it is stored or returned.
 */
export interface ChatDeps extends RunDeps {
  llm?: LlmClient;
  /** Per-visitor history on the shared demo account. */
  sessionHash?: string;
  /** Run limits for chat-triggered runs. */
  canRun?: () => { ok: true } | { ok: false; message: string };
}

export async function bossChat(projectId: number, message: string, deps: ChatDeps = {}): Promise<ChatReply> {
  const project = projects.byId(projectId);
  if (!project) throw new Error("project not found");
  const text = clip(message, 1000);
  const scope = deps.sessionHash ?? null;
  // Exchanges the server answered itself (run started, guard refusals) stay out of the model's history, so it can
  // neither imitate those replies nor see a refused attack again.
  const rows = chat.forProject(projectId, 10, scope);
  const serverReply = (i: number) => rows[i]?.role === "assistant" && (rows[i].model === "rule" || rows[i].model === "guard");
  const history = rows
    .filter((m, i) => !serverReply(i) && !(m.role === "user" && serverReply(i + 1)))
    .map((m) => ({ role: m.role, content: m.content }));
  chat.add(projectId, "user", text, undefined, scope);
  const tryRun = (): { reply: string; runId?: string } => {
    const lim = deps.canRun?.() ?? { ok: true as const };
    if (!lim.ok) return { reply: lim.message };
    const { runId } = startRun(projectId, "chat", deps);
    return { reply: `Started a research run (${runId}). Watch the live board.`, runId };
  };
  if (isRunRequest(text)) {
    const r = tryRun();
    chat.add(projectId, "assistant", r.reply, "rule", scope);
    return { reply: r.reply, model: "rule", runId: r.runId, dropped: 0 };
  }
  const llm = deps.llm ?? getLlm();
  const summary = runSummaryForChat(projectId);
  const messages = chatMessages({ project: project.name, summary, history, question: text });
  const hidden = messages.filter((m) => m.role === "system").map((m) => m.content);
  const res = await llm.chat({ purpose: "chat", messages, maxTokens: 2048 });
  let dropped = 0;
  for (const tc of res.toolCalls) {
    dropped++;
    audit.add({ project_id: projectId, source: "chat", tool: clip(tc.function.name, 80), args: clip(tc.function.arguments, 400), decision: "dropped", reason: "no tools are offered in chat" });
  }
  let reply: string;
  let model = res.empty ? "fallback" : res.model;
  let fromModel = false;
  if (res.empty) {
    reply = `(The language model is unavailable right now; this is a summary of the stored data.) ${summary.slice(0, 700)}`;
  } else if (/^\s*(?:```(?:json)?\s*)?\{\s*"action"\s*:\s*"run"/i.test(res.content)) {
    // The model asked for a run. It may not start one: plain requests were handled above, so this message was not one.
    audit.add({ project_id: projectId, source: "chat", tool: "start_run", args: clip(text, 200), decision: "dropped", reason: "the model cannot start runs; only a plain run request does" });
    reply = RUN_HINT;
    model = "guard";
  } else {
    reply = sanitizeText(res.content).replace(/\s+\n/g, "\n").trim().slice(0, 1200) || "I have no answer from the stored data.";
    fromModel = true;
  }
  reply = sanitizeText(reply);
  const g = fromModel ? guardChatReply(reply, { hidden, runStarted: false, raw: res.content }) : { reply, blocked: null };
  if (g.blocked) {
    // Stored with model "guard" (shown under the reply), so a refused echo is visible without keeping its text.
    reply = g.reply;
    model = "guard";
  }
  chat.add(projectId, "assistant", reply, model, scope);
  return { reply, model, dropped };
}
