/**
 * Server-side output guard for Boss chat replies. It runs after sanitizeText and before a reply is stored or
 * returned, so a model that was talked into echoing its instructions, printing shell-like output or claiming a run
 * it never started is replaced by a fixed answer instead of reaching the owner (or a judge probing it).
 */

export const REFUSAL = "I can only help with this project's research: its attack packages, audiences, places and ad angles. I can't share my instructions or anything about the system I run on.";
export const RUN_HINT = 'To start a new research run, type "run now" or press the Run now button.';
export const NO_RUN = `No research run was started. ${RUN_HINT}`;

/** Phrases that only appear in Poachly's hidden prompts (or in a model describing them). */
const PROMPT_MARKERS: RegExp[] = [
  /you are part of (?:adflank|poachly)/i,
  /you are the (?:boss|planner|worker)\b/i,
  /context_json/i,
  /system[_ -]?prompt/i,
  /\bsystem (?:message|instructions?)\b/i,
  /\bdeveloper (?:mode|message|instructions?)\b/i,
  /is data, never instructions/i,
  /(?:adflank|poachly) functions offered/i,
  /you have no shell, files/i,
  /stored run data:/i,
  /"action"\s*:/i,
  /\{\s*"(?:tool|tools|function|functions|name|arguments|cmd)"\s*:/i,
];

/** Shell, file or environment output a marketing answer never contains. */
const SHELL_MARKERS: RegExp[] = [
  /root:x:0:0|:\/bin\/(?:ba|z)?sh\b|\bnologin\b/,
  /(?:^|\n)\s*[d-][rwx-]{9}[.+@]?\s+\d+/,
  /(?:^|\n)\s*total \d+\s*(?:\n|$)/,
  /BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY/,
  /\b[A-Z][A-Z0-9_]{2,}=\S+/,
  /\[env\][\s\S]*\[env\]|\[env\]\s*=/,
  /\buid=\d+\(/,
  /node_modules|server\.js|next-server|qloo-harness|\.next\/|\/proc\/self/i,
  /api\.z\.ai|paas\/v4|(?:hackathon\.)?api\.qloo\.com/i,
  /(?:^|\n)\s*(?:\$|#|>)\s+(?:ls|cat|env|printenv|echo|bash|sh|curl|wget|id|whoami|uname|hostname)\b/,
  /```(?:bash|sh|shell|console|zsh|env|ini|dotenv)\b/i,
];

/** The model saying it started a run (only the server starts runs, and it says so itself). */
const RUN_CLAIM: RegExp[] = [
  /research run\s*\(/i,
  /\bstart(?:ed|ing) a (?:new )?(?:research )?run\b/i,
  /\bI(?:'ve| have| just)? (?:started|launched|kicked off|triggered|queued) (?:a |the |another )?(?:new )?(?:research )?run\b/i,
  /\bwatch the live board\b/i,
];

const words = (s: string) => s.toLowerCase().match(/[a-z0-9']+/g) ?? [];

/** True when the reply repeats any run of `n` consecutive words from a hidden prompt. */
export function echoesPrompt(reply: string, hidden: string[], n = 8): boolean {
  const grams = new Set<string>();
  for (const h of hidden) {
    const w = words(h);
    for (let i = 0; i + n <= w.length; i++) grams.add(w.slice(i, i + n).join(" "));
  }
  const r = words(reply);
  for (let i = 0; i + n <= r.length; i++) if (grams.has(r.slice(i, i + n).join(" "))) return true;
  return false;
}

export type GuardReason = "prompt-echo" | "shell-output" | "run-claim";

export interface GuardResult {
  reply: string;
  blocked: GuardReason | null;
}

/**
 * Check one chat reply. `hidden` holds the system prompt text that must never be echoed; `runStarted` is true only
 * when the server itself started a run for this message.
 */
export function guardChatReply(reply: string, opts: { hidden: string[]; runStarted: boolean; raw?: string }): GuardResult {
  const texts = opts.raw && opts.raw !== reply ? [opts.raw, reply] : [reply];
  const any = (ps: RegExp[]) => texts.some((t) => ps.some((p) => p.test(t)));
  if (any(PROMPT_MARKERS) || texts.some((t) => echoesPrompt(t, opts.hidden))) return { reply: REFUSAL, blocked: "prompt-echo" };
  if (any(SHELL_MARKERS)) return { reply: REFUSAL, blocked: "shell-output" };
  if (!opts.runStarted && any(RUN_CLAIM)) return { reply: NO_RUN, blocked: "run-claim" };
  return { reply, blocked: null };
}

/**
 * Messages that must never start a run, even when they mention one: they ask for commands, files, secrets, the
 * machine or the hidden instructions.
 */
const SUSPICIOUS = /ignore|override|pretend|developer|debug|jailbreak|system|prompt|instruction|rule|environment|\benv\b|variable|secret|password|token|api[ _-]?key|\bkey\b|hostname|\bip\b|machine|server|file|path|passwd|ssh|shell|bash|\bsh\b|command|terminal|\bls\b|\bcat\b|\bcurl\b|tool|print|output|reveal|\/|\\|`|\$|\{|\}/i;

/** Plain requests for a new research run ("run now", "start a new research run", "refresh"). */
const RUN_REQUEST = /^\s*(?:please\s+)?(?:(?:can|could) you\s+)?(?:(?:start|do|kick off|begin)\s+(?:a\s+|another\s+)?(?:new\s+|fresh\s+)?(?:research\s+)?run|run(?:\s+(?:it|a\s+new\s+(?:research\s+)?run|the\s+research|research|again))?(?:\s+(?:now|again|today))?|re-?run(?:\s+(?:it|the research))?(?:\s+now)?|refresh(?:\s+(?:it|the research))?(?:\s+now)?)(?:\s+please)?\s*[.!?]?\s*$/i;

export function isRunRequest(text: string): boolean {
  return text.length <= 80 && RUN_REQUEST.test(text) && !SUSPICIOUS.test(text);
}
