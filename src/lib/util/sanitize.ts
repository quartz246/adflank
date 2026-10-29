import os from "node:os";

/**
 * Redaction for anything that leaves the server process: tool results and errors on their way to the LLM,
 * LLM output on its way to the UI, and audit rows. Machine details never cross that line.
 */

const SENSITIVE_NAME = /(KEY|TOKEN|SECRET|PASS|PASSWORD|AUTH|COOKIE|SESSION|CREDENTIAL|PRIVATE)/i;
const BENIGN_VALUES = new Set(["node", "root", "app", "user", "adflank", "true", "false", "production", "development", "test"]);

let cachedValues: string[] | null = null;
let cachedNames: string[] | null = null;

function envValuesToRedact(): string[] {
  if (cachedValues) return cachedValues;
  const vals = new Set<string>();
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v !== "string" || v.length < 6) continue;
    if (SENSITIVE_NAME.test(k)) vals.add(v);
    if (["HOME", "PWD", "OLDPWD", "USER", "LOGNAME", "HOSTNAME", "QLOO_HOME", "DB_PATH", "TMPDIR", "XDG_RUNTIME_DIR"].includes(k)) vals.add(v);
  }
  try {
    const h = os.hostname();
    if (h && h.length >= 3 && !BENIGN_VALUES.has(h)) vals.add(h);
    const u = os.userInfo().username;
    if (u && u.length >= 5 && !BENIGN_VALUES.has(u)) vals.add(u);
  } catch {
    /* no user info in some sandboxes */
  }
  cachedValues = [...vals].sort((a, b) => b.length - a.length);
  return cachedValues;
}

function envNamesToRedact(): string[] {
  if (cachedNames) return cachedNames;
  cachedNames = Object.keys(process.env)
    .filter((k) => k.length >= 4 && /^[A-Z][A-Z0-9_]*$/.test(k) && (k.includes("_") || SENSITIVE_NAME.test(k)))
    .sort((a, b) => b.length - a.length);
  return cachedNames;
}

/** Only for tests: forget the cached env snapshot. */
export function resetSanitizerCache(): void {
  cachedValues = null;
  cachedNames = null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const URL_RE = /\b(?:https?|wss?|ftp|file):\/\/[^\s"'<>)]+/gi;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g;
const IPV6_RE = /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi;
// Absolute paths under common roots, Windows drive paths and ~/ paths.
const UNIX_PATH_RE = /(?:~|\B)\/(?:home|root|Users|etc|var|tmp|opt|srv|proc|usr|mnt|data|app|run|dev|sys|bin|sbin|lib|boot|media|snap|private|workspace)(?:\/[^\s"'`<>,;:)]*)?/g;
const WIN_PATH_RE = /\b[A-Za-z]:\\[^\s"'<>]*/g;
const HOST_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:local|internal|lan|intranet|corp|home\.arpa|localdomain)\b/gi;
const SECRETISH_RE = /\b(?:sk|pk|rk|ghp|gho|github_pat|xox[abpr])[-_][A-Za-z0-9_-]{12,}\b/g;
const ENV_ASSIGN_RE = /\b[A-Z][A-Z0-9_]{2,}=[^\s]+/g;
const ENV_NAME_RE = /\b[A-Z][A-Z0-9]*_(?:[A-Z0-9]+_)*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|URL|HOME|PATH|MODE|MODEL)\b/g;

/** Redact machine details and secrets from a string. */
export function sanitizeText(input: string): string {
  if (!input) return input;
  let s = String(input);
  for (const v of envValuesToRedact()) if (s.includes(v)) s = s.split(v).join("[redacted]");
  s = s.replace(SECRETISH_RE, "[redacted]");
  s = s.replace(URL_RE, "[url]");
  s = s.replace(ENV_ASSIGN_RE, "[env]");
  s = s.replace(UNIX_PATH_RE, "[path]");
  s = s.replace(WIN_PATH_RE, "[path]");
  s = s.replace(IPV4_RE, "[ip]");
  s = s.replace(IPV6_RE, "[ip]");
  s = s.replace(HOST_RE, "[host]");
  const names = envNamesToRedact();
  if (names.length) {
    const re = new RegExp(`\\b(?:${names.map(escapeRe).join("|")})\\b`, "g");
    s = s.replace(re, "[env]");
  }
  s = s.replace(ENV_NAME_RE, "[env]");
  return s;
}

/** Deep-sanitise every string in a JSON-like value. */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") return sanitizeText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeDeep(v);
    return out as T;
  }
  return value;
}

/** Short, single-line, sanitised text for logs and the UI. */
export function clip(input: unknown, max = 300): string {
  const s = sanitizeText(typeof input === "string" ? input : JSON.stringify(input) ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
