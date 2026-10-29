import { audit, calls, chat, entities, packages, runLog, runs, tasks, type ProjectRow } from "@/lib/db/repo";
import type { AttackPackage } from "@/lib/types/attack";
import { sanitizeDeep } from "@/lib/util/sanitize";
import { cleanLandingUrl } from "@/lib/util/url";

/** Board state for a run, as sent to the browser (sanitised; no raw Qloo envelopes). */
export function runState(runId: string) {
  const run = runs.byId(runId);
  if (!run) return null;
  return sanitizeDeep({
    run,
    tasks: tasks.forRun(runId),
    calls: calls.forRun(runId).map(({ result_json: _r, ...c }) => ({ ...c, args: safeJson(c.args_json) })),
    log: runLog.forRun(runId),
    packages: packages.forRun(runId).map((p) => ({ competitor: p.competitor, copySource: p.copy_source })),
    dropped: audit.forRun(runId).filter((a) => a.decision === "dropped").length,
  });
}

export function projectView(p: ProjectRow, chatScope?: string) {
  const last = runs.lastForProject(p.id);
  const done = runs.latestDone(p.id);
  return {
    project: p,
    entities: entities.forProject(p.id).map((e) => ({ ...e, candidates: e.candidates_json ? safeJson(e.candidates_json) : [] })),
    runs: runs.forProject(p.id, 10),
    lastRunId: last?.id ?? null,
    latestDoneRunId: done?.id ?? null,
    packages: done ? packages.forRun(done.id).map((r) => ({ copySource: r.copy_source, pkg: JSON.parse(r.package_json) as AttackPackage })) : [],
    chat: chat.forProject(p.id, 50, chatScope),
  };
}

/**
 * projectView as sent to the browser: every string sanitised, except the landing URL. cleanLandingUrl validated it
 * on save (public https only), and sanitizeText would show it as "[url]", which the next save then refuses.
 */
export function publicProjectView(p: ProjectRow, chatScope?: string) {
  const view = sanitizeDeep(JSON.parse(JSON.stringify(projectView(p, chatScope))));
  return { ...view, project: { ...view.project, landing_url: cleanLandingUrl(p.landing_url) } };
}

export function safeJson(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Compact, sanitised summary of stored run data for the Boss chat prompt. */
export function runSummaryForChat(projectId: number): string {
  const done = runs.latestDone(projectId);
  if (!done) return "No completed run yet.";
  const lines: string[] = [`Latest completed run ${done.id} at ${done.finished_at ?? done.started_at}.`];
  for (const row of packages.forRun(done.id)) {
    const p = JSON.parse(row.package_json) as AttackPackage;
    lines.push(
      `Competitor ${p.competitor.name}: strongest areas ${p.where.slice(0, 4).map((w) => w.city ?? w.region).join(", ") || "n/a"}; ` +
        `age skew ${p.who.ages.map((a) => `${a.band} ${a.share}`).join(", ") || "n/a"}; ` +
        `interests ${p.interests.slice(0, 6).map((i) => i.name).join(", ") || "n/a"}; ` +
        `podcasts/creators ${p.creators.slice(0, 5).map((c) => c.name).join(", ") || "n/a"}; ` +
        `gap ${p.gap.slice(0, 5).map((g) => `${g.label} (+${g.delta})`).join(", ") || "n/a"}; ` +
        `trends ${p.trends.map((t) => `${t.entity} ${t.direction}`).join(", ") || "n/a"}; ` +
        `vs last run: ${p.vsLastRun ? p.vsLastRun.summary : "first run"}; copy angles: ${p.copyAngles.join(" | ")}`,
    );
  }
  return lines.join("\n").slice(0, 6000);
}
