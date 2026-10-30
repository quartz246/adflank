/** Plain-language wording for agent activity (shared by the results page and the project page). */
export const TERMINAL_KINDS = new Set(["agent", "llm", "fill", "gate", "warn", "error"]);
export const TOOL_WORDS: Record<string, string> = {
  qloo_describe: "looking up",
  qloo_trends: "reading the trend line for",
  qloo_where_popular: "mapping where fans are for",
  qloo_audience_demographics: "reading the age and gender skew of",
  qloo_entity_tags: "reading the taste tags of",
  qloo_recommend: "finding what fans also love for",
  qloo_compare_audiences: "comparing your fans with",
};


const ROLE_LINES: Record<string, string> = {
  market: "Planner picked the competitors",
  planner: "Planner wrote the research plan",
  worker: "Worker chose its Qloo calls",
  copy: "Composer wrote the ad angles",
};

/** "worker: answered by glm-4.5-flash (fallback: …)" -> "Worker chose its Qloo calls (glm-4.5-flash)". */
export function agentLine(text: string): string {
  const m = text.match(/^(\w+): answered by ([\w.\-]+)/);
  if (m) return ROLE_LINES[m[1]] ?? m[1];
  const e = text.match(/^(\w+): no usable LLM answer/);
  return e ? `${ROLE_LINES[e[1]] ?? e[1]} (rule-based fallback)` : text;
}

