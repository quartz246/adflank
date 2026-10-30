import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getLlm } from "@/lib/llm";
import type { ChatMessage, ChatRequest, ChatResult, LlmClient } from "@/lib/llm/types";
import { getQloo } from "@/lib/qloo/client";
import type { QlooClient } from "@/lib/qloo/types";
import { countryName } from "@/lib/geo/cities";
import { audit, calls, entities, packages, projects, runLog, runs, tasks, type CallRow, type EntityRow, type ProjectRow } from "@/lib/db/repo";
import { emit } from "./events";
import { gateToolCall, runGatedTool, toolDefs, type AllowedTool, type SlimResult } from "./tools";
import { plannerMessages, workerMessages, type WorkerCtx } from "./prompts";
import { composePackage, writeCopyAngles, compareWithLastRun } from "./compose";
import { resolveEntity } from "./resolve";
import { PHASES, SITE_TRIGGER, findCompetitors, readWebsite, step, type Phase } from "./wizard";
import { clip, sanitizeText } from "@/lib/util/sanitize";

export const MAX_WORKER_TURNS = 4;
export const MAX_CALLS_PER_TURN = 8;
export const MAX_LLM_CALLS_PER_WORKER = 14;

export function newRunId(): string {
  return `r${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
}

export interface RunDeps {
  llm?: LlmClient;
  qloo?: QlooClient;
  now?: Date;
}

/** Short entity type ("brand") from a Qloo urn ("urn:entity:brand"). */
export function shortType(urn: string | null | undefined): string {
  const t = (urn ?? "").split(":").pop() || "brand";
  return ["artist", "book", "brand", "movie", "person", "place", "podcast", "tv_show", "videogame"].includes(t) ? t : "brand";
}

export function trendWindow(now = new Date()): { start: string; end: string } {
  // Qloo trend data lags by several weeks: a window ending ~60 days ago returns weekly points.
  const d = (days: number) => new Date(now.getTime() - days * 86400e3).toISOString().slice(0, 10);
  return { start: d(180), end: d(60) };
}

export function marketOf(p: ProjectRow): string {
  const country = countryName(p.country_code) ?? p.country_code;
  return p.city ? `${p.city}, ${country}` : country;
}

/** Shared state for one run: LLM bookkeeping, citations, audit. */
class RunState {
  modelsUsed: string[] = [];
  fallbackReasons = new Set<string>();
  constructor(readonly runId: string, readonly project: ProjectRow, readonly llm: LlmClient, readonly qloo: QlooClient) {}

  log(kind: string, text: string): void {
    const row = runLog.add(this.runId, kind, clip(text, 600));
    emit(this.project.id, { type: "log", log: row });
  }

  async ask(req: ChatRequest): Promise<ChatResult> {
    const res = await this.llm.chat(req);
    if (res.fallbackReason) this.fallbackReasons.add(res.fallbackReason);
    if (!res.empty) {
      this.modelsUsed.push(res.model);
      runs.setModel(this.runId, res.model, res.fallbackReason ? sanitizeText(res.fallbackReason) : undefined);
      this.log("llm", `${req.purpose}: answered by ${res.model}${res.fallbackReason ? ` (fallback: ${res.fallbackReason})` : ""}`);
    } else {
      this.log("llm", `${req.purpose}: no usable LLM answer (${clip(res.error ?? "empty", 80)}); using the labelled deterministic fallback`);
    }
    return res;
  }

  auditSink(source: string) {
    return (r: { tool: string; args: string; decision: "accepted" | "dropped"; reason: string }) => {
      audit.add({ run_id: this.runId, project_id: this.project.id, source, ...r });
      if (r.decision === "dropped") this.log("gate", `dropped ${r.tool}: ${r.reason}`);
    };
  }

  /** Execute an allowlisted Qloo call and store it as a citable record. */
  async qlooCall(tool: AllowedTool, args: Record<string, unknown>, opts: { taskId: number | null; competitor: string | null; filledBy: "llm" | "code" }): Promise<{ cite: string; res: SlimResult }> {
    emit(this.project.id, { type: "call_start", runId: this.runId, tool, args, competitor: opts.competitor, filledBy: opts.filledBy });
    const t0 = Date.now();
    const res = await runGatedTool(this.qloo, tool, args);
    const n = calls.nextN(this.runId);
    const cite = `q_${this.runId}_${n}`;
    const row = calls.insert({
      cite_id: cite,
      run_id: this.runId,
      task_id: opts.taskId,
      n,
      tool,
      args_json: JSON.stringify(args),
      ok: res.ok ? 1 : 0,
      status: res.status,
      summary: res.summary ?? null,
      result_json: JSON.stringify(res.data),
      filled_by: opts.filledBy,
      competitor: opts.competitor,
      duration_ms: Date.now() - t0,
    });
    const { result_json: _omit, ...pub } = row;
    void _omit;
    emit(this.project.id, { type: "call", call: pub });
    return { cite, res };
  }
}

const planSchema = z.object({ tasks: z.array(z.object({ competitor: z.string().max(200), focus: z.string().max(400) })).max(20) });

function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function plan(st: RunState, brand: EntityRow | undefined, comps: EntityRow[]): Promise<Map<number, string>> {
  const t = tasks.add(st.runId, "planner", "Plan today's research", null, "running");
  emit(st.project.id, { type: "task", task: t });
  const defaults = new Map(comps.map((c) => [c.id, `Find where people like ${c.name}'s customers are, who they are, what they love, and the gap versus ${brand?.name ?? "our brand"}.`]));
  const res = await st.ask({ purpose: "planner", messages: plannerMessages({ brand: brand?.name ?? "our brand", competitors: comps.map((c) => c.name), within: marketOf(st.project) }), json: true, maxTokens: 2048 });
  let source = "deterministic default plan (LLM unavailable)";
  if (!res.empty) {
    const parsed = planSchema.safeParse(parseJsonLoose(res.content));
    if (parsed.success) {
      source = `plan by ${res.model}`;
      for (const task of parsed.data.tasks) {
        const c = comps.find((x) => x.name.toLowerCase() === task.competitor.trim().toLowerCase());
        if (c) defaults.set(c.id, clip(task.focus, 300));
        else st.log("gate", `planner proposed a task for an unknown competitor; dropped`);
      }
    } else source = "deterministic default plan (LLM reply was not valid plan JSON)";
  }
  const done = tasks.update(t.id, "done", `${source}; ${comps.length} worker task(s)`);
  emit(st.project.id, { type: "task", task: done });
  return defaults;
}

interface Need {
  key: string;
  tool: AllowedTool;
  match: (c: { tool: string; args: Record<string, unknown> }) => boolean;
  args: Record<string, unknown>;
}

/** qloo_recommend runs once per target type: podcasts and TV shows to sponsor, brands as co-marketing partners. */
export const RECOMMEND_TARGETS = [
  { key: "podcasts", targetType: "podcast" },
  { key: "shows", targetType: "tv_show" },
  { key: "brands", targetType: "brand" },
] as const;

export function requiredCalls(ctx: WorkerCtx): Need[] {
  const type = ctx.entityType;
  const needs: Need[] = [
    { key: "trends", tool: "qloo_trends", match: (c) => c.tool === "qloo_trends", args: { entities: ctx.brandId ? [ctx.brandId, ctx.competitorId] : [ctx.competitorId], entity_type: type, start_date: ctx.trendStart, end_date: ctx.trendEnd, limit: 20 } },
    { key: "where", tool: "qloo_where_popular", match: (c) => c.tool === "qloo_where_popular", args: { entity: ctx.competitorId, entity_type: type, within: ctx.within, limit: 20 } },
    { key: "who", tool: "qloo_audience_demographics", match: (c) => c.tool === "qloo_audience_demographics", args: { entity: ctx.competitorId, entity_type: type } },
    { key: "tags", tool: "qloo_entity_tags", match: (c) => c.tool === "qloo_entity_tags", args: { entities: [ctx.competitorId], entity_type: type, limit: 12 } },
    ...RECOMMEND_TARGETS.map(({ key, targetType }): Need => ({
      key,
      tool: "qloo_recommend",
      match: (c) => c.tool === "qloo_recommend" && c.args.target_type === targetType,
      args: { target_type: targetType, signals: [ctx.competitorId], limit: 8 },
    })),
  ];
  if (ctx.brandId) {
    needs.push({ key: "gap", tool: "qloo_compare_audiences", match: (c) => c.tool === "qloo_compare_audiences", args: { group_a: [ctx.brandId], group_b: [ctx.competitorId], limit: 20 } });
  }
  return needs;
}

/** Replace project entity names with their Qloo ids in entity-reference fields (names are ambiguous across types). */
function canonicalise(args: Record<string, unknown>, names: Map<string, string>): Record<string, unknown> {
  const map = (v: unknown) => (typeof v === "string" ? (names.get(v.trim().toLowerCase()) ?? v) : v);
  const out: Record<string, unknown> = { ...args };
  for (const k of ["entity", "entities", "signals", "group_a", "group_b"]) {
    if (k in out) out[k] = Array.isArray(out[k]) ? (out[k] as unknown[]).map(map) : map(out[k]);
  }
  return out;
}

/** One Worker for one competitor. With a phase (website flow), it is offered only that step's tools and calls. */
async function work(st: RunState, ctx: WorkerCtx, names: Map<string, string>, phase?: Phase): Promise<void> {
  const needed = () => requiredCalls(ctx).filter((n) => !phase || (phase.keys as readonly string[]).includes(n.key));
  const t = tasks.add(st.runId, "worker", phase ? `${phase.label}: ${ctx.competitor}` : `Research ${ctx.competitor}`, ctx.competitor, "running", ctx.focus);
  emit(st.project.id, { type: "task", task: t });
  const made: Array<{ tool: string; args: Record<string, unknown>; ok: boolean }> = [];
  const sink = st.auditSink("worker");
  const messages: ChatMessage[] = workerMessages(ctx, phase?.promptSteps);
  let llmCalls = 0;
  let llmOk = false;
  for (let turn = 0; turn < MAX_WORKER_TURNS; turn++) {
    const res = await st.ask({ purpose: "worker", messages, tools: toolDefs(phase ? [...phase.tools] : undefined), maxTokens: 4096 });
    if (res.empty) break;
    llmOk = true;
    if (res.toolCalls.length === 0) break;
    const batch = res.toolCalls.slice(0, MAX_CALLS_PER_TURN);
    // The model's own text goes back into the transcript sanitised too (a manipulated model must not seed later prompts).
    messages.push({ role: "assistant", content: res.content ? clip(res.content, 1000) : null, tool_calls: batch });
    for (const tc of batch) {
      let reply: string;
      if (llmCalls >= MAX_LLM_CALLS_PER_WORKER) {
        sink({ tool: clip(tc.function.name, 80), args: clip(tc.function.arguments, 400), decision: "dropped", reason: "call budget for this worker reached" });
        reply = JSON.stringify({ error: "dropped: call budget reached" });
      } else {
        const g = gateToolCall(tc.function.name, tc.function.arguments, sink);
        if (g.ok && phase && !phase.tools.includes(g.name)) {
          sink({ tool: g.name, args: clip(tc.function.arguments, 400), decision: "dropped", reason: "not offered in this step" });
          reply = JSON.stringify({ error: "dropped by Poachly: that function is not offered in this step." });
        } else if (!g.ok) {
          reply = JSON.stringify({ error: `dropped by Poachly: ${g.reason}. Only the offered functions can be used.` });
        } else {
          llmCalls++;
          const args = canonicalise(g.args, names);
          const { cite, res: r } = await st.qlooCall(g.name, args, { taskId: t.id, competitor: ctx.competitor, filledBy: "llm" });
          made.push({ tool: g.name, args, ok: r.ok });
          reply = JSON.stringify({ cite, status: r.status, summary: r.summary, data: r.data }).slice(0, 6000);
        }
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: reply });
    }
    // Any calls beyond the per-turn cap still need a reply for a valid transcript; they are simply not run.
    for (const tc of res.toolCalls.slice(MAX_CALLS_PER_TURN)) {
      sink({ tool: clip(tc.function.name, 80), args: clip(tc.function.arguments, 400), decision: "dropped", reason: "too many calls in one turn" });
    }
    if (made.length > 0 && needed().every((n) => made.some((m) => m.ok && n.match(m)))) break;
  }
  // Code fills any required call the LLM did not make (or that failed), labelled on the board.
  const filled: string[] = [];
  for (const need of needed()) {
    if (made.some((m) => m.ok && need.match(m))) continue;
    const g = gateToolCall(need.tool, need.args, st.auditSink("code"));
    if (!g.ok) continue;
    const { res } = await st.qlooCall(g.name, g.args, { taskId: t.id, competitor: ctx.competitor, filledBy: "code" });
    made.push({ tool: g.name, args: g.args, ok: res.ok });
    filled.push(need.key);
  }
  if (filled.length) st.log("fill", `${ctx.competitor}: code filled ${filled.join(", ")} (${llmOk ? "not called or failed by the LLM" : "LLM unavailable"})`);
  const okCount = made.filter((m) => m.ok).length;
  const done = tasks.update(t.id, "done", `${okCount}/${made.length} Qloo calls ok; ${llmCalls} chosen by the LLM, ${filled.length} filled by code`);
  emit(st.project.id, { type: "task", task: done });
}

/** Make sure brand and competitors are resolved in Qloo (describe calls are cited too). */
async function ensureResolved(st: RunState, list: EntityRow[]): Promise<EntityRow[]> {
  const pending = list.filter((e) => e.status === "unchecked" || !e.qloo_id);
  if (pending.length === 0) return list;
  const t = tasks.add(st.runId, "planner", "Check entities in Qloo", null, "running");
  emit(st.project.id, { type: "task", task: t });
  for (const e of pending) {
    if (e.status === "not_found" || e.status === "ambiguous") continue; // the owner has to pick a candidate first
    const g = gateToolCall("qloo_describe", { entity: e.name, type: "brand" }, st.auditSink("code"));
    if (!g.ok) {
      entities.setResolution(e.id, { status: "not_found" });
      continue;
    }
    const { res } = await st.qlooCall("qloo_describe", g.args, { taskId: t.id, competitor: e.role === "competitor" ? e.name : null, filledBy: "code" });
    resolveEntity(e.id, e.name, res);
  }
  const done = tasks.update(t.id, "done", `${pending.length} checked`);
  emit(st.project.id, { type: "task", task: done });
  return entities.forProject(st.project.id);
}

export interface RunOutcome {
  runId: string;
  status: "done" | "failed";
  model: string;
  packages: number;
  citedCalls: number;
  error?: string;
}

/** One full daily loop for a project. Never throws; failures end the run as failed with a sanitised reason. */
export async function executeRun(runId: string, projectId: number, deps: RunDeps = {}): Promise<RunOutcome> {
  const project = projects.byId(projectId);
  if (!project) return { runId, status: "failed", model: "none", packages: 0, citedCalls: 0, error: "project not found" };
  const llm = deps.llm ?? getLlm();
  const qloo = deps.qloo ?? getQloo();
  const st = new RunState(runId, project, llm, qloo);
  emit(project.id, { type: "run", run: runs.byId(runId)! });
  try {
    st.log("info", `Run started (Qloo ${qloo.mode}, LLM ${llm.mode === "mock" ? "mock" : llm.configuredModel})`);
    // Projects started from a website keep the six-step flow on every later run (manual, chat or daily).
    const wizard = Boolean(project.landing_url) && runs.forProject(project.id, 50).some((r) => r.trigger === SITE_TRIGGER);
    if (wizard) {
      const site = await readWebsite(st);
      await findCompetitors(st, site);
    }
    let list = entities.forProject(project.id);
    list = await ensureResolved(st, list);
    const brand = list.find((e) => e.role === "brand");
    const brandFound = brand && brand.status === "found" && brand.qloo_id ? brand : undefined;
    const comps = list.filter((e) => e.role === "competitor");
    const ready = comps.filter((c) => c.status === "found" && c.qloo_id);
    for (const c of comps.filter((x) => !ready.includes(x))) st.log("warn", `${c.name} was not found in Qloo; skipped. Pick the right entity on the project page.`);
    if (!brandFound) st.log("warn", `Brand ${brand?.name ?? "(none)"} is not resolved in Qloo; audience comparison is skipped.`);
    if (ready.length === 0) throw new Error("No competitor is resolved in Qloo yet. Add or fix competitors first.");

    if (wizard) {
      step(st, 3, "working");
      st.log("agent", `planning the research on ${ready.map((c) => c.name).join(" and ")}`);
    }
    const focus = await plan(st, brand, ready);
    const win = trendWindow(deps.now);
    const names = new Map<string, string>();
    for (const e of list) if (e.qloo_id) {
      names.set(e.name.toLowerCase(), e.qloo_id);
      if (e.qloo_name) names.set(e.qloo_name.toLowerCase(), e.qloo_id);
    }
    const ctxs: WorkerCtx[] = ready.map((c) => ({
      brand: brand?.name ?? "our brand",
      brandId: brandFound?.qloo_id ?? null,
      competitor: c.name,
      competitorId: c.qloo_id!,
      entityType: shortType(c.qloo_type),
      within: marketOf(project),
      trendStart: win.start,
      trendEnd: win.end,
      focus: focus.get(c.id) ?? "",
    }));
    // Workers run one after another: the LLM endpoint is rate limited and the board reads better.
    if (wizard) {
      // Website flow: step by step across all competitors, so the page moves through steps 3, 4 and 5 in order.
      for (const phase of PHASES) {
        if (phase.step === 5 && !brandFound) {
          // No audience of our own to compare with: the opening is what their fans love most (step 4's taste tags).
          const tags = calls.forRun(runId).filter((c) => c.ok && c.tool === "qloo_entity_tags" && c.competitor !== null).length;
          step(st, 5, "done", `their strongest tastes · ${tags} competitor${tags === 1 ? "" : "s"}`);
          continue;
        }
        step(st, phase.step, "working");
        // Competitors in parallel within a step: the page still moves through the steps in order.
        await Promise.all(ctxs.map((ctx) => work(st, ctx, names, phase)));
        const n = calls.forRun(runId).filter((c) => c.ok && c.competitor !== null && phase.tools.includes(c.tool as AllowedTool)).length;
        step(st, phase.step, "done", `${n} Qloo call${n === 1 ? "" : "s"} · ${ctxs.length} competitor${ctxs.length === 1 ? "" : "s"}`);
      }
      step(st, 6, "working");
    } else for (const ctx of ctxs) await work(st, ctx, names);

    const all = calls.forRun(runId);
    let made = 0;
    await Promise.all(ctxs.map(async (ctx) => {
      const t = tasks.add(runId, "composer", `Build attack package vs ${ctx.competitor}`, ctx.competitor, "running");
      emit(project.id, { type: "task", task: t });
      const pkg = composePackage({ runId, project, brand: brandFound ?? brand, competitor: ready.find((c) => c.name === ctx.competitor)!, calls: all.filter((c) => c.competitor === ctx.competitor || c.competitor === null), projectEntities: list });
      const copy = await writeCopyAngles(pkg, (req) => st.ask(req));
      pkg.copyAngles = copy.angles;
      if (copy.dropped) st.log("gate", `copy: dropped ${copy.dropped} angle(s) that did not cite a gap label or interest`);
      const vs = compareWithLastRun(pkg, project.id, runId);
      if (vs) pkg.vsLastRun = vs;
      packages.insert(runId, project.id, pkg, copy.source);
      made++;
      const done = tasks.update(t.id, "done", `${Object.keys(pkg.citations).length} cited Qloo calls; copy: ${copy.source}; ${vs ? (vs.gainingOn ? "gaining vs last run" : "not gaining vs last run") : "first run, nothing to compare yet"}`);
      emit(project.id, { type: "task", task: done });
      emit(project.id, { type: "package", runId, competitor: ctx.competitor });
    }));
    const model = st.modelsUsed.at(-1) ?? (llm.mode === "mock" ? "mock-llm" : "none (deterministic fallback)");
    runs.setModel(runId, model, st.fallbackReasons.size ? [...st.fallbackReasons].map((r) => sanitizeText(r)).join("; ") : undefined);
    if (wizard) step(st, 6, "done", `${made * 3} ad templates · ${made} competitor${made === 1 ? "" : "s"}`);
    runs.finish(runId, "done");
    st.log("info", `Run finished: ${made} attack package(s), ${calls.forRun(runId).length} Qloo calls, model ${model}`);
    emit(project.id, { type: "run", run: runs.byId(runId)! });
    emit(project.id, { type: "end", runId, status: "done" });
    return { runId, status: "done", model, packages: made, citedCalls: calls.forRun(runId).filter((c: CallRow) => c.ok).length };
  } catch (err) {
    const msg = clip(err instanceof Error ? err.message : String(err), 300);
    runs.finish(runId, "failed", msg);
    st.log("error", msg);
    emit(project.id, { type: "run", run: runs.byId(runId)! });
    emit(project.id, { type: "end", runId, status: "failed" });
    return { runId, status: "failed", model: st.modelsUsed.at(-1) ?? "none", packages: 0, citedCalls: 0, error: msg };
  }
}

// ---------------------------------------------------------------------------------------------
// Run manager: up to RUN_CONCURRENCY runs at once (default 3), the rest wait in order; a project never has two in flight.

const g = globalThis as unknown as { __adflankWaiting?: Array<() => void>; __adflankRunning?: { n: number }; __adflankActive?: Map<number, string> };
const active: Map<number, string> = (g.__adflankActive ??= new Map());
const waiting: Array<() => void> = (g.__adflankWaiting ??= []);
const slots = (g.__adflankRunning ??= { n: 0 });
const maxRuns = () => {
  const v = Number(process.env.RUN_CONCURRENCY);
  return Number.isInteger(v) && v > 0 ? v : 3;
};
async function acquire(): Promise<void> {
  if (slots.n < maxRuns()) {
    slots.n++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}
function release(): void {
  const next = waiting.shift();
  if (next) next();
  else slots.n--;
}

export function activeRunFor(projectId: number): string | undefined {
  return active.get(projectId);
}

/** Start a run (queued behind any other run). Returns the run id at once and a promise of its outcome. */
export function startRun(projectId: number, trigger: string, deps: RunDeps = {}): { runId: string; done: Promise<RunOutcome>; reused: boolean } {
  const existing = active.get(projectId);
  if (existing) return { runId: existing, done: Promise.resolve({ runId: existing, status: "done", model: "", packages: 0, citedCalls: 0 }), reused: true };
  const runId = newRunId();
  const qloo = deps.qloo ?? getQloo();
  runs.create(runId, projectId, trigger, qloo.mode);
  active.set(projectId, runId);
  const done = acquire()
    .then(() => executeRun(runId, projectId, { ...deps, qloo }).finally(release))
    .finally(() => active.delete(projectId));
  return { runId, done, reused: false };
}
