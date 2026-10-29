// AdFlank shared contract between the core app (loop, board, DB) and the ad-templates module.
// Copy into the app as src/lib/types/attack.ts. Change it only by agreement (note the change in adflank/CONTRACT_LOG.md).

/** Every claim in the product points to the Qloo call it came from. */
export interface QlooCitation {
  id: string;            // stable id, e.g. "q_<runId>_<n>"
  tool: "qloo_trends" | "qloo_where_popular" | "qloo_audience_demographics" | "qloo_entity_tags" |
        "qloo_recommend" | "qloo_compare_audiences" | "qloo_describe" | "qloo_rank" | "qloo_find_tags";
  args: Record<string, unknown>;
  at: string;            // ISO time of the call
  ok: boolean;
}

export interface Brand {
  name: string;
  qlooId?: string;       // entity id from qloo_describe; undefined = not found in Qloo
  type?: string;         // Qloo entity type urn, e.g. "urn:entity:brand"
}

export interface GeoTarget { city?: string; region?: string; countryCode: string; score: number; cite: string }
export interface AgeShare { band: "18-24" | "25-34" | "35-44" | "45-54" | "55+"; share: number }
export interface Audience { ages: AgeShare[]; female?: number; male?: number; cite: string }
export interface Interest { name: string; qlooTagId?: string; affinity: number; cite: string }
export interface Creator {
  name: string;
  kind: "podcast" | "artist" | "tv_show" | "brand" | "place" | "person" | "other";
  affinity: number;
  cite: string;
}
/** Something the competitor's fans love that the brand's fans don't: the switching hook. */
export interface GapHook { label: string; theirs: number; yours: number; delta: number; cite: string }
export interface Trend {
  entity: string;
  direction: "rising" | "flat" | "falling";
  changePct?: number;    // relative change first->last weekly point, %. Always set when flat (0 when Qloo returned < 2 points)
  points?: number;       // weekly points Qloo returned in the window (0 = no trend data, so a flat 0 % means "no data")
  latest?: number;       // latest weekly population percentile, 0..1
  cite: string;
}

/** One trend series (brand or competitor) compared with the same series in the previous run. */
export interface TrendChange {
  entity: string;
  role: "brand" | "competitor";
  direction: Trend["direction"];
  changePct: number;                   // this run's change, %. Always a number (0 when flat or no weekly points)
  prevDirection?: Trend["direction"];  // undefined when the series was missing in the previous run
  prevChangePct?: number;
  deltaPts: number;                    // changePct - prevChangePct, percentage points (0 when there is no previous value)
  cite: string;
  prevCite?: string;
}
export interface GapLabelChange { label: string; delta: number; prevDelta: number; change: number }
export interface GapChange {
  total: number;            // sum of GapHook.delta this run
  prevTotal: number;        // same sum in the previous run
  change: number;           // total - prevTotal; < 0 = the taste gap narrowed
  added: string[];          // gap labels new this run
  dropped: string[];        // gap labels gone since the previous run
  moved: GapLabelChange[];  // labels in both runs whose delta changed, biggest change first
  cite?: string;
  prevCite?: string;
}
export interface ListChange { added: string[]; dropped: string[] }
/** Structured "what changed since the last run" for one package. */
export interface RunChanges {
  momentum: { now: number; before: number; change: number };  // brand changePct - competitor changePct, pts
  trends: TrendChange[];    // brand first, then competitor
  gap: GapChange;
  creators: ListChange;     // recommended podcasts, TV shows, artists and brands entering or leaving
  where: ListChange;        // named metros entering or leaving the top 5
  unchanged: boolean;       // true when none of the above moved
}

/** One attack package per (brand, competitor, run). Input for the ad templates. */
export interface AttackPackage {
  runId: string;
  createdAt: string;
  brand: Brand;
  competitor: Brand;
  locale: { countryCodes: string[]; language: string };   // international: Qloo filters by city and country code
  where: GeoTarget[];
  who: Audience;
  interests: Interest[];
  creators: Creator[];       // qloo_recommend results: podcasts, then TV shows, artists, brands (co-marketing partners)
  gap: GapHook[];
  trends: Trend[];           // brand and competitor
  copyAngles: string[];      // short angles built on the gap, written by the LLM, each grounded in gap/interests
  vsLastRun?: {
    previousRunId: string;
    previousRunAt?: string;  // ISO time the previous run finished
    gainingOn: boolean;
    summary: string;         // one paragraph: momentum, taste gap and what changed since the previous run
    cite: string[];
    changes?: RunChanges;    // set by every run since 10-29; absent on packages stored before
  };
  citations: Record<string, QlooCitation>;
  // Wording rule: Qloo gives aggregate taste, never customer names or emails.
  // Always say "people like <competitor>'s customers", never "their customers".
}

export type AdPlatform = "meta" | "tiktok" | "google";

export interface TemplateIssue { field: string; message: string; severity: "error" | "warn" }

/** Output of the ad-templates module, one per platform per package. */
export interface PlatformTemplate {
  platform: AdPlatform;
  packageRunId: string;
  json: unknown;                        // platform-shaped campaign/ad set/ad (or campaign/ad group/RSA)
  csv?: { filename: string; content: string };   // bulk-upload shape where the platform has one
  issues: TemplateIssue[];              // limit checks (lengths, counts), empty when valid
  cites: string[];                      // QlooCitation ids used
}
