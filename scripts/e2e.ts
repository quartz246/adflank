/**
 * End-to-end run from the command line:
 *   npm run e2e -- --brand "Brand" --competitors "A,B" --country US [--city "Austin"] [--out DIR]
 * Uses live Qloo when QLOO_API_KEY is set (else the synthetic mock) and GLM when GLM_API_KEY is set (else the mock LLM).
 * Output (Qloo data) is written to --out, which must be outside the repo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { users, projects, entities, calls, packages, runs, runLog, tasks, audit } from "../src/lib/db/repo";
import { startRun } from "../src/lib/agent/run";
import { getQloo } from "../src/lib/qloo/client";
import { getLlm } from "../src/lib/llm";
import { liveQlooClient } from "../src/lib/qloo/mcp";

const { values } = parseArgs({
  options: {
    brand: { type: "string" },
    competitors: { type: "string" },
    country: { type: "string", default: "US" },
    city: { type: "string" },
    out: { type: "string" },
    project: { type: "string" },
  },
});

async function main() {
  if (!values.brand || !values.competitors) throw new Error("usage: --brand X --competitors A,B [--country US] [--city C] [--out DIR]");
  const email = "e2e@adflank.invalid";
  const user = users.byEmail(email) ?? users.create(email, "!disabled");
  let project = values.project ? projects.owned(Number(values.project), user.id) : undefined;
  if (!project) {
    project = projects.create(user.id, `${values.brand} vs ${values.competitors}`, values.country!.toUpperCase(), values.city ?? null);
    entities.add(project.id, "brand", values.brand);
    for (const c of values.competitors.split(",").map((s) => s.trim()).filter(Boolean)) entities.add(project.id, "competitor", c);
  }
  const llm = getLlm();
  console.log(`project ${project.id}; qloo=${getQloo().mode}; llm=${llm.mode === "mock" ? "mock" : llm.configuredModel}`);
  const t0 = Date.now();
  const { runId, done } = startRun(project.id, "e2e");
  const outcome = await done;
  const secs = Math.round((Date.now() - t0) / 1000);
  const run = runs.byId(runId)!;
  const pk = packages.forRun(runId).map((p) => JSON.parse(p.package_json));
  const allCalls = calls.forRun(runId);
  const summary = {
    runId,
    status: outcome.status,
    error: outcome.error,
    seconds: secs,
    qlooMode: run.qloo_mode,
    llmModelUsed: run.llm_model_used,
    llmFallbackReason: run.llm_fallback_reason,
    brand: values.brand,
    competitors: values.competitors.split(","),
    market: [values.city, values.country].filter(Boolean).join(", "),
    qlooCalls: allCalls.length,
    qlooCallsOk: allCalls.filter((c) => c.ok).length,
    callsByLlm: allCalls.filter((c) => c.filled_by === "llm").length,
    callsFilledByCode: allCalls.filter((c) => c.filled_by === "code").length,
    citedInPackages: pk.map((p) => ({ competitor: p.competitor.name, cited: Object.keys(p.citations).length, where: p.where.length, ages: p.who.ages.length, interests: p.interests.length, creators: p.creators.length, gap: p.gap.length, trends: p.trends.length, copyAngles: p.copyAngles.length, vsLastRun: Boolean(p.vsLastRun) })),
    auditDropped: audit.forRun(runId).filter((a) => a.decision === "dropped").length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (values.out) {
    const dir = path.resolve(values.out);
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
    const file = path.join(dir, `E2E_${stamp}_${runId}.json`);
    writeFileSync(file, JSON.stringify({ summary, packages: pk, calls: allCalls, tasks: tasks.forRun(runId), log: runLog.forRun(runId), audit: audit.forRun(runId) }, null, 1));
    console.log(`saved ${file}`);
  }
  if (getQloo().mode === "live") await liveQlooClient().close();
  process.exit(outcome.status === "done" ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
