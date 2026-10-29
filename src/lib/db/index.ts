import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'US',
  city TEXT,
  schedule_daily INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('brand','competitor')),
  name TEXT NOT NULL,
  qloo_id TEXT,
  qloo_type TEXT,
  qloo_name TEXT,
  status TEXT NOT NULL DEFAULT 'unchecked' CHECK (status IN ('unchecked','found','not_found','ambiguous')),
  candidates_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued','running','done','failed')),
  trigger TEXT NOT NULL,
  llm_model_used TEXT,
  llm_fallback_reason TEXT,
  qloo_mode TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  competitor TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS qloo_calls (
  cite_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_id INTEGER,
  n INTEGER NOT NULL,
  tool TEXT NOT NULL,
  args_json TEXT NOT NULL,
  ok INTEGER NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  result_json TEXT,
  filled_by TEXT NOT NULL,
  competitor TEXT,
  duration_ms INTEGER,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  competitor TEXT NOT NULL,
  package_json TEXT NOT NULL,
  copy_source TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tool_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT,
  project_id INTEGER,
  source TEXT NOT NULL,
  tool TEXT NOT NULL,
  args TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('accepted','dropped')),
  reason TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS run_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate ON rate_events(kind, key, at);
CREATE TABLE IF NOT EXISTS app_meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, started_at);
CREATE INDEX IF NOT EXISTS idx_calls_run ON qloo_calls(run_id, n);
CREATE INDEX IF NOT EXISTS idx_tasks_run ON tasks(run_id);
CREATE INDEX IF NOT EXISTS idx_packages_run ON packages(run_id);
CREATE INDEX IF NOT EXISTS idx_packages_project ON packages(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_run ON tool_audit(run_id);
`;

const g = globalThis as unknown as { __adflankDb?: DatabaseSync; __adflankDbPath?: string };

export function dbPath(): string {
  return process.env.DB_PATH || path.resolve(process.cwd(), "data/adflank.db");
}

/** One connection per process (node:sqlite, synchronous). */
export function getDb(): DatabaseSync {
  const p = dbPath();
  if (g.__adflankDb && g.__adflankDbPath === p) return g.__adflankDb;
  if (p !== ":memory:") mkdirSync(path.dirname(p), { recursive: true });
  const db = new DatabaseSync(p);
  db.exec(SCHEMA);
  // Additive migrations for databases created by earlier builds.
  const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!cols("chat_messages").includes("session_hash")) db.exec("ALTER TABLE chat_messages ADD COLUMN session_hash TEXT");
  if (!cols("projects").includes("landing_url")) db.exec("ALTER TABLE projects ADD COLUMN landing_url TEXT");
  // Earlier builds stored raw rate-limit keys (client IPs); only digests are written now, so drop the old rows.
  db.exec("DELETE FROM rate_events WHERE length(key) != 25 OR substr(key, 1, 1) != 'k'");
  // Runs that were in flight when the process stopped will never finish.
  db.prepare("UPDATE runs SET status='failed', error='interrupted by restart', finished_at=? WHERE status IN ('queued','running')").run(new Date().toISOString());
  g.__adflankDb = db;
  g.__adflankDbPath = p;
  return db;
}

const secretCache = new Map<string, string>();

/** A random per-database secret (created on first use), e.g. the HMAC key for rate-limit digests. */
export function metaSecret(name: string): string {
  const db = getDb();
  const cacheKey = `${g.__adflankDbPath}\0${name}`;
  const hit = secretCache.get(cacheKey);
  if (hit) return hit;
  db.prepare("INSERT OR IGNORE INTO app_meta (k, v) VALUES (?, ?)").run(`secret:${name}`, randomBytes(32).toString("hex"));
  const v = String((db.prepare("SELECT v FROM app_meta WHERE k = ?").get(`secret:${name}`) as { v: string }).v);
  secretCache.set(cacheKey, v);
  return v;
}

/** Tests only: drop the cached connection (e.g. after switching DB_PATH). */
export function resetDb(): void {
  try {
    g.__adflankDb?.close();
  } catch {
    /* already closed */
  }
  g.__adflankDb = undefined;
  g.__adflankDbPath = undefined;
  secretCache.clear();
}

export const nowIso = () => new Date().toISOString();
