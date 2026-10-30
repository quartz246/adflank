import { rate, users } from "@/lib/db/repo";
import { isGuestUser } from "@/lib/auth/session";

/** Abuse limits for the public demo (DB-backed, so they survive restarts). All configurable by env. */
const n = (name: string, def: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
};
const HOUR = 3600_000;
const DAY = 24 * HOUR;

export const LIMITS = {
  runsPerUserDay: () => n("RUN_LIMIT_PER_USER_DAY", 50),
  runsPerIpDay: () => n("RUN_LIMIT_PER_IP_DAY", 10),
  runsDemoDay: () => n("RUN_LIMIT_DEMO_DAY", 12),
  chatPerUserHour: () => n("CHAT_LIMIT_PER_USER_HOUR", 40),
  signupsPerIpHour: () => n("SIGNUP_LIMIT_PER_IP_HOUR", 10),
  loginsPerIpHour: () => n("LOGIN_LIMIT_PER_IP_HOUR", 60),
  projectsPerUserDay: () => n("PROJECT_LIMIT_PER_USER_DAY", 15),
  lookupsPerIpHour: () => n("LOOKUP_LIMIT_PER_IP_HOUR", 60),
};

/** Client address as seen through the Cloudflare tunnel (cf-connecting-ip), else the first forwarded hop. */
export function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim().slice(0, 64);
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim().slice(0, 64);
  return "local";
}

export type LimitResult = { ok: true } | { ok: false; message: string };

/** A run started by a person (not the scheduler): per account per day; visitors without an account also per IP per day. */
export function allowRun(userId: number, ip: string, isDemo: boolean): LimitResult {
  if (isDemo) {
    if (!rate.hit("run-demo", "demo", DAY, LIMITS.runsDemoDay())) return { ok: false, message: "The shared demo project has reached today's run limit. Sign up (instant, free) to run your own project." };
  } else if (!rate.hit("run-user", String(userId), DAY, LIMITS.runsPerUserDay())) {
    return { ok: false, message: `Run limit reached (${LIMITS.runsPerUserDay()} per day per account). The daily scheduled run still happens.` };
  }
  // Signed-in accounts have their own daily limit only; the per-network limit guards against anonymous visitors.
  if (!isDemo && !isGuestUser(users.byId(userId))) return { ok: true };
  if (!rate.hit("run-ip", ip, DAY, LIMITS.runsPerIpDay())) return { ok: false, message: "Daily limit for visitors without an account reached. Create a free account to keep going." };
  return { ok: true };
}

export function allow(kind: "chat" | "signup" | "login" | "project" | "lookup", key: string): LimitResult {
  const table = {
    chat: [HOUR, LIMITS.chatPerUserHour(), "Chat limit reached for this hour."],
    signup: [HOUR, LIMITS.signupsPerIpHour(), "Too many signups from your network. Try again later."],
    login: [HOUR, LIMITS.loginsPerIpHour(), "Too many login attempts. Try again later."],
    project: [DAY, LIMITS.projectsPerUserDay(), "Project limit reached for today."],
    lookup: [HOUR, LIMITS.lookupsPerIpHour(), "Too many Qloo lookups from your network. Try again in a while."],
  } as const;
  const [win, max, msg] = table[kind];
  return rate.hit(kind, key, win, max) ? { ok: true } : { ok: false, message: msg };
}
