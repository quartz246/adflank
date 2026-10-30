import { createHmac } from "node:crypto";
import { getDb, nowIso, metaSecret } from "./index";
import type { AttackPackage } from "@/lib/types/attack";

export interface UserRow { id: number; email: string; pass_hash: string; created_at: string }
export interface ProjectRow { id: number; user_id: number; name: string; country_code: string; city: string | null; schedule_daily: number; created_at: string; landing_url?: string | null }
export interface EntityRow {
  id: number; project_id: number; role: "brand" | "competitor"; name: string; qloo_id: string | null; qloo_type: string | null; qloo_name: string | null;
  status: "unchecked" | "found" | "not_found" | "ambiguous"; candidates_json: string | null; created_at: string;
}
export interface RunRow {
  id: string; project_id: number; status: "queued" | "running" | "done" | "failed"; trigger: string; llm_model_used: string | null;
  llm_fallback_reason: string | null; qloo_mode: string | null; error: string | null; started_at: string; finished_at: string | null;
}
export interface TaskRow { id: number; run_id: string; role: string; competitor: string | null; title: string; status: string; detail: string | null; created_at: string; updated_at: string }
export interface CallRow {
  cite_id: string; run_id: string; task_id: number | null; n: number; tool: string; args_json: string; ok: number; status: string; summary: string | null;
  result_json: string | null; filled_by: "llm" | "code"; competitor: string | null; duration_ms: number | null; at: string;
}
export interface PackageRow { id: number; run_id: string; project_id: number; competitor: string; package_json: string; copy_source: string | null; created_at: string }
export interface ChatRow { id: number; project_id: number; role: "user" | "assistant"; content: string; model: string | null; created_at: string }
export interface AuditRow { id: number; run_id: string | null; project_id: number | null; source: string; tool: string; args: string | null; decision: "accepted" | "dropped"; reason: string | null; at: string }
export interface LogRow { id: number; run_id: string; kind: string; text: string; at: string }

const db = () => getDb();
type Row = Record<string, unknown>;
const one = <T>(r: unknown) => (r as T | undefined) ?? undefined;
const many = <T>(r: unknown) => r as T[];

// users / sessions
export const users = {
  create(email: string, passHash: string): UserRow {
    const r = db().prepare("INSERT INTO users (email, pass_hash, created_at) VALUES (?, ?, ?) RETURNING *").get(email, passHash, nowIso());
    return r as unknown as UserRow;
  },
  byEmail: (email: string) => one<UserRow>(db().prepare("SELECT * FROM users WHERE email = ?").get(email)),
  byId: (id: number) => one<UserRow>(db().prepare("SELECT * FROM users WHERE id = ?").get(id)),
  /** A guest account becomes a real one: same id, so its projects and session stay. */
  claim: (id: number, email: string, passHash: string) => void db().prepare("UPDATE users SET email = ?, pass_hash = ? WHERE id = ?").run(email, passHash, id),
};

export const sessions = {
  create(tokenHash: string, userId: number, ttlDays = 14): void {
    const exp = new Date(Date.now() + ttlDays * 86400e3).toISOString();
    db().prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(tokenHash, userId, nowIso(), exp);
  },
  user(tokenHash: string): UserRow | undefined {
    return one<UserRow>(
      db().prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?").get(tokenHash, nowIso()),
    );
  },
  delete: (tokenHash: string) => void db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash),
  purgeExpired: () => void db().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso()),
};

// projects / entities
export const projects = {
  create(userId: number, name: string, countryCode: string, city: string | null): ProjectRow {
    return db().prepare("INSERT INTO projects (user_id, name, country_code, city, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *").get(userId, name, countryCode, city, nowIso()) as unknown as ProjectRow;
  },
  forUser: (userId: number) => many<ProjectRow>(db().prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY id DESC").all(userId)),
  byId: (id: number) => one<ProjectRow>(db().prepare("SELECT * FROM projects WHERE id = ?").get(id)),
  /** Project only if it belongs to this user (every route checks ownership through this). */
  owned: (id: number, userId: number) => one<ProjectRow>(db().prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(id, userId)),
  update(id: number, fields: { name?: string; country_code?: string; city?: string | null; schedule_daily?: number; landing_url?: string | null }): void {
    const cur = projects.byId(id);
    if (!cur) return;
    db().prepare("UPDATE projects SET name = ?, country_code = ?, city = ?, schedule_daily = ?, landing_url = ? WHERE id = ?").run(
      fields.name ?? cur.name, fields.country_code ?? cur.country_code, fields.city === undefined ? cur.city : fields.city, fields.schedule_daily ?? cur.schedule_daily,
      fields.landing_url === undefined ? (cur.landing_url ?? null) : fields.landing_url, id,
    );
  },
  delete: (id: number) => void db().prepare("DELETE FROM projects WHERE id = ?").run(id),
  scheduled: () => many<ProjectRow>(db().prepare("SELECT * FROM projects WHERE schedule_daily = 1 ORDER BY id").all()),
};

export const entities = {
  add(projectId: number, role: "brand" | "competitor", name: string): EntityRow {
    return db().prepare("INSERT INTO entities (project_id, role, name, created_at) VALUES (?, ?, ?, ?) RETURNING *").get(projectId, role, name, nowIso()) as unknown as EntityRow;
  },
  forProject: (projectId: number) => many<EntityRow>(db().prepare("SELECT * FROM entities WHERE project_id = ? ORDER BY role, id").all(projectId)),
  byId: (id: number) => one<EntityRow>(db().prepare("SELECT * FROM entities WHERE id = ?").get(id)),
  setResolution(id: number, r: { status: EntityRow["status"]; qloo_id?: string | null; qloo_type?: string | null; qloo_name?: string | null; candidates?: unknown[] | null }): void {
    db().prepare("UPDATE entities SET status = ?, qloo_id = ?, qloo_type = ?, qloo_name = ?, candidates_json = ? WHERE id = ?").run(
      r.status, r.qloo_id ?? null, r.qloo_type ?? null, r.qloo_name ?? null, r.candidates ? JSON.stringify(r.candidates) : null, id,
    );
  },
  remove: (id: number) => void db().prepare("DELETE FROM entities WHERE id = ?").run(id),
};

// runs / tasks / calls / packages / log
export const runs = {
  create(id: string, projectId: number, trigger: string, qlooMode: string): RunRow {
    return db().prepare("INSERT INTO runs (id, project_id, status, trigger, qloo_mode, started_at) VALUES (?, ?, 'running', ?, ?, ?) RETURNING *").get(id, projectId, trigger, qlooMode, nowIso()) as unknown as RunRow;
  },
  byId: (id: string) => one<RunRow>(db().prepare("SELECT * FROM runs WHERE id = ?").get(id)),
  forProject: (projectId: number, limit = 20) => many<RunRow>(db().prepare("SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT ?").all(projectId, limit)),
  latestDone: (projectId: number, beforeId?: string) =>
    one<RunRow>(
      beforeId
        ? db().prepare("SELECT * FROM runs WHERE project_id = ? AND status = 'done' AND id != ? AND started_at < (SELECT started_at FROM runs WHERE id = ?) ORDER BY started_at DESC LIMIT 1").get(projectId, beforeId, beforeId)
        : db().prepare("SELECT * FROM runs WHERE project_id = ? AND status = 'done' ORDER BY started_at DESC LIMIT 1").get(projectId),
    ),
  active: () => many<RunRow>(db().prepare("SELECT * FROM runs WHERE status IN ('queued','running')").all()),
  lastForProject: (projectId: number) => one<RunRow>(db().prepare("SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1").get(projectId)),
  setModel: (id: string, model: string, fallbackReason?: string) =>
    void db().prepare("UPDATE runs SET llm_model_used = ?, llm_fallback_reason = COALESCE(?, llm_fallback_reason) WHERE id = ?").run(model, fallbackReason ?? null, id),
  finish: (id: string, status: "done" | "failed", error?: string) =>
    void db().prepare("UPDATE runs SET status = ?, error = ?, finished_at = ? WHERE id = ?").run(status, error ?? null, nowIso(), id),
};

export const tasks = {
  add(runId: string, role: string, title: string, competitor?: string | null, status = "queued", detail?: string): TaskRow {
    const t = nowIso();
    return db().prepare("INSERT INTO tasks (run_id, role, competitor, title, status, detail, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *").get(runId, role, competitor ?? null, title, status, detail ?? null, t, t) as unknown as TaskRow;
  },
  update(id: number, status: string, detail?: string): TaskRow {
    return db().prepare("UPDATE tasks SET status = ?, detail = COALESCE(?, detail), updated_at = ? WHERE id = ? RETURNING *").get(status, detail ?? null, nowIso(), id) as unknown as TaskRow;
  },
  forRun: (runId: string) => many<TaskRow>(db().prepare("SELECT * FROM tasks WHERE run_id = ? ORDER BY id").all(runId)),
};

export const calls = {
  nextN: (runId: string) => Number((db().prepare("SELECT COALESCE(MAX(n), 0) + 1 AS n FROM qloo_calls WHERE run_id = ?").get(runId) as Row).n),
  insert(row: Omit<CallRow, "at"> & { at?: string }): CallRow {
    return db()
      .prepare("INSERT INTO qloo_calls (cite_id, run_id, task_id, n, tool, args_json, ok, status, summary, result_json, filled_by, competitor, duration_ms, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *")
      .get(row.cite_id, row.run_id, row.task_id, row.n, row.tool, row.args_json, row.ok, row.status, row.summary, row.result_json, row.filled_by, row.competitor, row.duration_ms, row.at ?? nowIso()) as unknown as CallRow;
  },
  forRun: (runId: string) => many<CallRow>(db().prepare("SELECT * FROM qloo_calls WHERE run_id = ? ORDER BY n").all(runId)),
  byCite: (cite: string) => one<CallRow>(db().prepare("SELECT * FROM qloo_calls WHERE cite_id = ?").get(cite)),
};

export const packages = {
  insert(runId: string, projectId: number, pkg: AttackPackage, copySource: string): void {
    db().prepare("INSERT INTO packages (run_id, project_id, competitor, package_json, copy_source, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(runId, projectId, pkg.competitor.name, JSON.stringify(pkg), copySource, nowIso());
  },
  forRun: (runId: string) => many<PackageRow>(db().prepare("SELECT * FROM packages WHERE run_id = ? ORDER BY id").all(runId)),
  /** Packages of the latest completed run of a project. */
  latest(projectId: number): PackageRow[] {
    const r = runs.latestDone(projectId);
    return r ? packages.forRun(r.id) : [];
  },
};

export const chat = {
  /** sessionHash scopes messages on the shared demo account to one visitor's session. */
  add: (projectId: number, role: "user" | "assistant", content: string, model?: string, sessionHash?: string | null) =>
    db().prepare("INSERT INTO chat_messages (project_id, role, content, model, created_at, session_hash) VALUES (?, ?, ?, ?, ?, ?) RETURNING *").get(projectId, role, content, model ?? null, nowIso(), sessionHash ?? null) as unknown as ChatRow,
  forProject: (projectId: number, limit = 50, sessionHash?: string | null) =>
    sessionHash
      ? many<ChatRow>(db().prepare("SELECT * FROM (SELECT * FROM chat_messages WHERE project_id = ? AND session_hash = ? ORDER BY id DESC LIMIT ?) ORDER BY id").all(projectId, sessionHash, limit))
      : many<ChatRow>(db().prepare("SELECT * FROM (SELECT * FROM chat_messages WHERE project_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id").all(projectId, limit)),
};

/**
 * Rate-limit keys are client addresses, account ids or session hashes. Only a keyed digest is ever written, so the
 * table holds no IP address (the docker gateway locally, a visitor's address behind the tunnel).
 */
export const rateKey = (kind: string, key: string) => `k${createHmac("sha256", metaSecret("rate_key")).update(`${kind}\0${key}`).digest("hex").slice(0, 24)}`;

export const rate = {
  /** Count-and-record: true when the event is allowed (fewer than max in the window), and records it. */
  hit(kind: string, rawKey: string, windowMs: number, max: number, now = Date.now()): boolean {
    const key = rateKey(kind, rawKey);
    const n = Number((db().prepare("SELECT COUNT(*) AS n FROM rate_events WHERE kind = ? AND key = ? AND at > ?").get(kind, key, now - windowMs) as Row).n);
    if (n >= max) return false;
    db().prepare("INSERT INTO rate_events (kind, key, at) VALUES (?, ?, ?)").run(kind, key, now);
    if (Math.random() < 0.02) db().prepare("DELETE FROM rate_events WHERE at < ?").run(now - 7 * 86400e3);
    return true;
  },
};

export const audit = {
  add: (r: { run_id?: string | null; project_id?: number | null; source: string; tool: string; args: string; decision: "accepted" | "dropped"; reason: string }) =>
    void db().prepare("INSERT INTO tool_audit (run_id, project_id, source, tool, args, decision, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(r.run_id ?? null, r.project_id ?? null, r.source, r.tool, r.args, r.decision, r.reason, nowIso()),
  forRun: (runId: string) => many<AuditRow>(db().prepare("SELECT * FROM tool_audit WHERE run_id = ? ORDER BY id").all(runId)),
  forProject: (projectId: number) => many<AuditRow>(db().prepare("SELECT * FROM tool_audit WHERE project_id = ? ORDER BY id").all(projectId)),
};

export const runLog = {
  add: (runId: string, kind: string, text: string) =>
    db().prepare("INSERT INTO run_log (run_id, kind, text, at) VALUES (?, ?, ?, ?) RETURNING *").get(runId, kind, text, nowIso()) as unknown as LogRow,
  forRun: (runId: string) => many<LogRow>(db().prepare("SELECT * FROM run_log WHERE run_id = ? ORDER BY id").all(runId)),
};
