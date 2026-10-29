import type { QlooClient, QlooEnvelope, QlooToolSchema } from "./types";
import schemas from "./tool-schemas.json";

/**
 * Synthetic Qloo stand-in for tests and keyless demos. Every value here is invented (seeded from the
 * input text); no Qloo response data is stored in the repo. Shapes follow the harness envelopes.
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rand(seed: string): () => number {
  let x = hash(seed) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10_000) / 10_000;
  };
}
export function mockId(name: string): string {
  const h = hash(name.toLowerCase()).toString(16).padStart(8, "0").toUpperCase();
  return `${h}-0000-4000-8000-${h}0000`.slice(0, 36);
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const TAGS = ["Outdoor Adventure", "Minimalist Design", "Streetwear", "Sustainability", "Indie Music", "Craft Coffee", "Fitness Tracking", "Retro Gaming", "Plant-Based", "Late-Night Comedy", "Vinyl Collecting", "Weekend Hiking", "Luxury", "Budget Friendly", "Family Time", "Esports"];
const PODCASTS = ["The Synthetic Hour", "Morning Mock Show", "Fictional Founders", "Placeholder Pod", "Example Sports Talk", "Demo Data Diaries", "Sample Story Radio", "Testbed Tales"];
const BRANDS = ["Brand Alpha", "Brand Beta", "Brand Gamma", "Brand Delta", "Brand Epsilon", "Brand Zeta"];
const TV_SHOWS = ["Show Placeholder", "The Mock Kitchen", "Synthetic Survivors", "Example Late Night", "Demo Detectives", "Sample Sitcom"];
const CITY_POINTS: Record<string, Array<[number, number]>> = {
  default: [[40.71, -74.0], [34.05, -118.24], [41.88, -87.63], [29.76, -95.37], [33.75, -84.39], [47.61, -122.33], [25.76, -80.19], [39.74, -104.99]],
  GB: [[51.51, -0.13], [53.48, -2.24], [52.49, -1.89], [55.95, -3.19]],
  DE: [[52.52, 13.4], [48.14, 11.58], [53.55, 9.99], [50.11, 8.68]],
};

export class MockQlooClient implements QlooClient {
  readonly mode = "mock" as const;
  calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  /** Names that mock Qloo does not know (to exercise the not-found path). */
  unknown = (name: string) => /unknown|zzq|not.?in.?qloo/i.test(name);

  async tools(): Promise<QlooToolSchema[]> {
    return schemas as QlooToolSchema[];
  }

  private nameOf(ref: string): string {
    return ref;
  }

  async call(name: string, args: Record<string, unknown>): Promise<QlooEnvelope> {
    this.calls.push({ name, args });
    const op = name.replace(/^qloo_/, "");
    const ok = (extra: Record<string, unknown>): QlooEnvelope => ({ schema_version: "mock", operation: op, status: "ok", ...extra });
    switch (name) {
      case "qloo_describe": {
        const e = String(args.entity ?? "");
        if (this.unknown(e)) {
          return {
            schema_version: "mock",
            operation: op,
            status: "needs_input",
            summary: "Choose the intended Qloo entity.",
            results: [],
            resolution: { issues: [{ input: e, kind: "ambiguous", input_kind: "entity", field: "entity", candidates: BRANDS.slice(0, 3).map((n) => ({ id: mockId(n), name: n, type: "urn:entity:brand", popularity: 0.8 })) }] },
          };
        }
        return ok({ results: [{ entity_id: mockId(e), name: e, popularity: 0.9, properties: { short_description: `${e} (synthetic mock entity).` } }], result_count: 1, interpretation: { entity: { input: e, entityId: mockId(e), name: e, type: `urn:entity:${args.type ?? "brand"}`, match: "exact" } } });
      }
      case "qloo_trends": {
        const ents = (args.entities as string[]) ?? [];
        return ok({
          series: ents.map((e) => {
            const r = rand(`trend:${e}`);
            const startP = 0.4 + r() * 0.4;
            const drift = (r() - 0.5) * 0.1;
            return {
              entity: { input: e, entityId: e, name: e },
              points: Array.from({ length: 8 }, (_, i) => ({ date: `2026-0${(i % 9) + 1}-01`, population_percentile: r3(startP + drift * (7 - i) / 7), population_rank_velocity: 0, velocity_fold_change: r3(drift) })),
            };
          }),
          result_count: ents.length,
        });
      }
      case "qloo_where_popular": {
        const r = rand(`where:${args.entity}:${args.within}`);
        const within = String(args.within ?? "");
        const pts = CITY_POINTS[/germany|deutschland/i.test(within) ? "DE" : /kingdom|britain|england|uk\b/i.test(within) ? "GB" : "default"];
        const n = Math.min(Number(args.limit ?? 8), pts.length);
        return ok({ results: pts.slice(0, n).map(([lat, lon], i) => ({ location: { latitude: lat + r() * 0.05, longitude: lon + r() * 0.05, geohash: "mock" }, query: { affinity: r3(1 - i * 0.03 - r() * 0.01), popularity: r3(0.9 - i * 0.05) } })), result_count: n, interpretation: { within } });
      }
      case "qloo_audience_demographics": {
        const r = rand(`demo:${args.entity}`);
        const v = () => r3(r() * 1.2 - 0.6);
        return ok({ results: [{ entity_id: String(args.entity), query: { age: { "24_and_younger": v(), "25_to_29": v(), "30_to_34": v(), "35_to_44": v(), "45_to_54": v(), "55_and_older": v() }, gender: { male: v(), female: v() } } }], result_count: 1 });
      }
      case "qloo_entity_tags": {
        const r = rand(`tags:${JSON.stringify(args.entities)}`);
        const start = Math.floor(r() * 8);
        const n = Math.min(Number(args.limit ?? 10), 8);
        return ok({ results: Array.from({ length: n }, (_, i) => { const nm = TAGS[(start + i) % TAGS.length]; return { id: `urn:tag:mock:${nm.toLowerCase().replace(/\W+/g, "_")}`, name: nm, type: "urn:tag:mock", affinity: r3(1 - i * 0.05), popularity: r3(r()) }; }), result_count: n });
      }
      case "qloo_recommend": {
        const r = rand(`rec:${args.target_type}:${JSON.stringify(args.signals)}`);
        const pool = args.target_type === "podcast" ? PODCASTS : args.target_type === "tv_show" ? TV_SHOWS : BRANDS;
        const n = Math.min(Number(args.limit ?? 6), pool.length);
        const start = Math.floor(r() * pool.length);
        return ok({ results: Array.from({ length: n }, (_, i) => { const nm = pool[(start + i) % pool.length]; return { entity_id: mockId(nm), name: nm, type: "urn:entity", subtype: `urn:entity:${args.target_type}`, affinity: r3(0.95 - i * 0.04), popularity: r3(r()) }; }), result_count: n });
      }
      case "qloo_compare_audiences": {
        const a = JSON.stringify(args.group_a);
        const b = JSON.stringify(args.group_b);
        const ra = rand(`cmpA:${a}`);
        const rb = rand(`cmpB:${b}`);
        const pick = (r: () => number, k: number) => Array.from({ length: k }, () => TAGS[Math.floor(r() * TAGS.length)]).filter((v, i, arr) => arr.indexOf(v) === i);
        const tag = (nm: string, extra: Record<string, unknown>) => ({ tag_id: `urn:tag:mock:${nm.toLowerCase().replace(/\W+/g, "_")}`, name: nm, type: "urn:tag", subtype: "urn:tag:mock", popularity: 0.5, query: extra });
        const A = pick(ra, 7);
        const B = pick(rb, 7);
        const shared = A.filter((t) => B.includes(t));
        return ok({ results: { tags: shared.map((t, i) => tag(t, { score: r3(0.8 - i * 0.05) })), a: A.map((t) => tag(t, { count: "1" })), b: B.map((t) => tag(t, { count: "1" })) } });
      }
      case "qloo_find_tags":
        return ok({ results: TAGS.slice(0, 3).map((t) => ({ id: `urn:tag:mock:${t.toLowerCase().replace(/\W+/g, "_")}`, name: t })), result_count: 3 });
      default:
        return { status: "error", operation: op, summary: `Unknown tool ${name}`, error: { code: "UNKNOWN_TOOL", retryable: false, recovery: "" } };
    }
  }
}
