import { z } from "zod";
import type { ToolDef } from "@/lib/llm/types";
import type { QlooClient, QlooEnvelope } from "@/lib/qloo/types";
import { nearestCity } from "@/lib/geo/cities";
import { clip, sanitizeDeep, sanitizeText } from "@/lib/util/sanitize";

/**
 * The tool gate. GLM is offered exactly these functions and nothing else. Every call it asks for is
 * checked against this fixed allowlist and a strict zod schema before AdFlank runs it; anything else is
 * dropped and written to tool_audit. Results go back to GLM as slimmed, sanitised data.
 */

const ref = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[\p{L}\p{N}\p{M} &'’.,:()!+\-_/#@]+$/u, "unsupported characters");
const refs = (max: number) => z.array(ref).min(1).max(max);
const insightsType = z.enum(["artist", "book", "brand", "movie", "person", "place", "podcast", "tv_show", "videogame"]);
const searchType = z.enum(["artist", "book", "brand", "movie", "person", "place", "podcast", "tv_show", "videogame", "locality", "actor", "album", "author", "director"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const limit = z.number().int().min(1).max(20);
const place = z.string().trim().min(2).max(80).regex(/^[\p{L}\p{N}\p{M} ,.'’()-]+$/u, "unsupported characters");

export const TOOL_SCHEMAS = {
  qloo_describe: z.object({ entity: ref, type: searchType.optional() }).strict(),
  qloo_trends: z.object({ entities: refs(5), entity_type: insightsType, start_date: date, end_date: date, limit: limit.optional() }).strict(),
  qloo_where_popular: z.object({ entity: ref, entity_type: searchType.optional(), within: place, limit: limit.optional() }).strict(),
  qloo_audience_demographics: z.object({ entity: ref, entity_type: searchType.optional(), limit: limit.optional() }).strict(),
  qloo_entity_tags: z.object({ entities: refs(10), entity_type: searchType.optional(), limit: limit.optional() }).strict(),
  qloo_recommend: z
    .object({ target_type: insightsType, signals: refs(10).optional(), filter_location: place.optional(), signal_location: place.optional(), demographic: z.string().max(60).regex(/^[\p{L}\p{N} -]+$/u).optional(), limit: limit.optional() })
    .strict(),
  qloo_compare_audiences: z.object({ group_a: refs(10), group_b: refs(10), target_type: insightsType.optional(), limit: limit.optional() }).strict(),
} as const;

export type AllowedTool = keyof typeof TOOL_SCHEMAS;
export const ALLOWED_TOOLS = Object.keys(TOOL_SCHEMAS) as AllowedTool[];

const DESCRIPTIONS: Record<AllowedTool, string> = {
  qloo_describe: "Resolve one named entity (brand, artist, place...) to its Qloo entity id.",
  qloo_trends: "Weekly popularity percentile time series for 1-5 entities over a date range (YYYY-MM-DD).",
  qloo_where_popular: "Areas inside a country or city where an entity's audience has the strongest affinity.",
  qloo_audience_demographics: "Aggregate age and gender skew of an entity's audience (relative index, -1..1).",
  qloo_entity_tags: "Taste tags (genres, lifestyles, styles) that characterise an entity's audience.",
  qloo_recommend: "Entities of a target type (podcast, brand, artist, tv_show, place...) that an audience with these signals likes.",
  qloo_compare_audiences: "Compare two audiences: shared tags plus tags specific to group_a and to group_b.",
};

export function isAllowedTool(name: string): name is AllowedTool {
  return Object.prototype.hasOwnProperty.call(TOOL_SCHEMAS, name);
}

/** OpenAI-style tool definitions generated from the same zod schemas the gate enforces. */
export function toolDefs(names: AllowedTool[] = ALLOWED_TOOLS): ToolDef[] {
  return names.map((name) => {
    const schema = z.toJSONSchema(TOOL_SCHEMAS[name]) as Record<string, unknown>;
    delete schema.$schema;
    return { type: "function", function: { name, description: DESCRIPTIONS[name], parameters: schema } };
  });
}

export type GateDecision =
  | { ok: true; name: AllowedTool; args: Record<string, unknown> }
  | { ok: false; name: string; reason: string };

export interface AuditSink {
  (row: { tool: string; args: string; decision: "accepted" | "dropped"; reason: string }): void;
}

/** Check a requested tool call. Never throws; unknown names and invalid args come back as dropped. */
export function gateToolCall(name: unknown, rawArgs: unknown, audit?: AuditSink): GateDecision {
  const toolName = typeof name === "string" ? name.slice(0, 80) : String(name).slice(0, 80);
  const argText = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs ?? {});
  const drop = (reason: string): GateDecision => {
    audit?.({ tool: clip(toolName, 80), args: clip(argText, 400), decision: "dropped", reason });
    return { ok: false, name: clip(toolName, 80), reason };
  };
  if (!isAllowedTool(toolName)) return drop("tool not in allowlist");
  let parsed: unknown;
  if (typeof rawArgs === "string") {
    if (rawArgs.length > 4000) return drop("arguments too long");
    try {
      parsed = rawArgs.trim() ? JSON.parse(rawArgs) : {};
    } catch {
      return drop("arguments are not valid JSON");
    }
  } else parsed = rawArgs ?? {};
  const res = TOOL_SCHEMAS[toolName].safeParse(parsed);
  if (!res.success) {
    const issue = res.error.issues[0];
    return drop(`invalid arguments: ${issue ? `${issue.path.join(".") || "(root)"} ${issue.message}` : "schema mismatch"}`.slice(0, 200));
  }
  const args = res.data as Record<string, unknown>;
  // The fan map wants every heat cell Qloo will give (20), whatever limit the model asked for.
  if (toolName === "qloo_where_popular") args.limit = 20;
  audit?.({ tool: toolName, args: clip(JSON.stringify(args), 400), decision: "accepted", reason: "" });
  return { ok: true, name: toolName, args };
}

// ---------------------------------------------------------------------------------------------
// Result slimming: keep only the data fields the product uses; drop provenance, execution, URLs.

type Obj = Record<string, unknown>;
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10_000) / 10_000 : undefined);
const str = (v: unknown, max = 120): string | undefined => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Obj[]) : []);

export interface SlimResult {
  status: string;
  ok: boolean;
  summary?: string;
  data: Obj;
}

function issues(env: QlooEnvelope) {
  return arr(env.resolution?.issues).slice(0, 5).map((i) => ({
    input: str(i.input, 80),
    kind: str(i.kind, 40),
    candidates: arr(i.candidates).slice(0, 6).map((c) => ({ id: str(c.id, 60), name: str(c.name), type: str(c.type, 40) })),
  }));
}

export function slimResult(tool: string, env: QlooEnvelope, args: Record<string, unknown> = {}): SlimResult {
  const status = String(env.status ?? "error");
  const ok = status === "ok" || status === "partial" || status === "degraded";
  if (!ok) {
    return sanitizeDeep({ status, ok, summary: clip(env.summary ?? env.error?.code ?? status, 200), data: { issues: issues(env) } });
  }
  let data: Obj = {};
  switch (tool) {
    case "qloo_describe": {
      const r = arr(env.results)[0] ?? {};
      const props = (r.properties ?? {}) as Obj;
      const interp = ((env.interpretation as Obj | undefined)?.entity ?? {}) as Obj;
      data = { entity: { id: str(r.entity_id, 60), name: str(r.name), type: str(interp.type, 40), popularity: num(r.popularity), description: str(props.short_description, 200) } };
      break;
    }
    case "qloo_trends": {
      const series = arr((env as Obj).series);
      data = {
        window: { start: str(args.start_date, 10), end: str(args.end_date, 10) },
        series: series.map((s) => {
          const e = (s.entity ?? {}) as Obj;
          const points = arr(s.points)
            .map((p) => ({ date: str(p.date, 10) ?? "", percentile: num(p.population_percentile), velocity: num(p.velocity_fold_change), delta: num(p.population_percent_delta) }))
            .sort((a, b) => a.date.localeCompare(b.date));
          return { input: str(e.input), id: str(e.entityId, 60), name: str(e.name), points };
        }),
      };
      break;
    }
    case "qloo_where_popular": {
      data = {
        within: str(args.within, 80),
        places: arr(env.results).map((r) => {
          const loc = (r.location ?? {}) as Obj;
          const q = (r.query ?? {}) as Obj;
          const lat = num(loc.latitude);
          const lon = num(loc.longitude);
          const near = lat !== undefined && lon !== undefined ? nearestCity(lat, lon) : undefined;
          return { lat, lon, near: near?.name, region: near?.region, countryCode: near?.countryCode, km: near?.km, affinity: num(q.affinity), popularity: num(q.popularity) };
        }),
      };
      break;
    }
    case "qloo_audience_demographics": {
      const q = ((arr(env.results)[0] ?? {}).query ?? {}) as Obj;
      const age = (q.age ?? {}) as Obj;
      const gender = (q.gender ?? {}) as Obj;
      data = {
        age: Object.fromEntries(Object.entries(age).map(([k, v]) => [k.slice(0, 20), num(v)])),
        gender: Object.fromEntries(Object.entries(gender).map(([k, v]) => [k.slice(0, 20), num(v)])),
      };
      break;
    }
    case "qloo_entity_tags": {
      data = { tags: arr(env.results).map((t) => ({ id: str(t.id, 100), name: str(t.name), type: str(t.type, 60), affinity: num(t.affinity), popularity: num(t.popularity) })) };
      break;
    }
    case "qloo_recommend": {
      data = {
        target_type: str(args.target_type, 20),
        items: arr(env.results).map((e) => ({ id: str(e.entity_id, 60), name: str(e.name), subtype: str(e.subtype, 40), affinity: num(e.affinity), popularity: num(e.popularity) })),
      };
      break;
    }
    case "qloo_compare_audiences": {
      const r = (env.results ?? {}) as Obj;
      const tag = (t: Obj) => ({ id: str(t.tag_id, 100), name: str(t.name), subtype: str(t.subtype, 60), score: num((t.query as Obj | undefined)?.score), popularity: num(t.popularity) });
      data = { shared: arr(r.tags).map(tag), a: arr(r.a).map(tag), b: arr(r.b).map(tag) };
      break;
    }
    default:
      data = {};
  }
  return sanitizeDeep({ status, ok, summary: env.summary ? clip(env.summary, 200) : undefined, data });
}

/** Run an already-gated call and slim the result. Errors come back sanitised. */
export async function runGatedTool(qloo: QlooClient, name: AllowedTool, args: Record<string, unknown>, signal?: AbortSignal): Promise<SlimResult> {
  try {
    const env = await qloo.call(name, args, signal);
    return slimResult(name, env, args);
  } catch (err) {
    return { status: "error", ok: false, summary: sanitizeText(err instanceof Error ? err.message : String(err)).slice(0, 200), data: {} };
  }
}
