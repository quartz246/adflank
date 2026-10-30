// Poachly ad-templates module. Pure functions: no network, no env, no file access.
import { z } from "zod";
import type { AttackPackage, PlatformTemplate } from "@/lib/types/attack";
import { contextFrom } from "./context";
import { GoogleInputSchema, buildGoogle, googleTemplate, planGoogle } from "./google";
import { MetaInputSchema, buildMeta, metaTemplate, planMeta } from "./meta";
import { TikTokInputSchema, buildTikTok, planTikTok, tiktokTemplate } from "./tiktok";

export { GoogleInputSchema, MetaInputSchema, TikTokInputSchema };
export type { GoogleInput } from "./google";
export type { MetaInput } from "./meta";
export type { TikTokInput } from "./tiktok";
export { planGoogle, planMeta, planTikTok, buildGoogle, buildMeta, buildTikTok };
export { hasErrors, errorCount } from "./validate";
export { peopleLike } from "./copy";
export { textLength } from "./limits";

export { PLATFORMS, PLATFORM_LABEL, CSV_PLATFORMS, isPlatform } from "./platforms";

export interface GenerateOptions {
  /** Brand landing page; without it templates use a placeholder and warn. */
  landingUrl?: string;
}

/** One template per platform (meta, tiktok, google), each validated against that platform's limits. */
export function generateTemplates(pkg: AttackPackage, opts: GenerateOptions = {}): PlatformTemplate[] {
  const templates = [metaTemplate(pkg, opts), tiktokTemplate(pkg, opts), googleTemplate(pkg, opts)];
  const lang = (pkg.locale.language || "en").toLowerCase();
  if (!lang.startsWith("en")) {
    for (const t of templates) {
      t.issues.push({ field: "copy", message: `The fixed template phrases are English; review them for language "${lang}" before upload.`, severity: "warn" });
    }
  }
  return templates;
}

// ---- Allowlisted LLM tools -------------------------------------------------------------------
// Core's tool gate may offer these to the model. The model sends a partial override of the plan;
// code merges it over the deterministic plan, validates it with the strict schema and builds.

const overrideOf = <T extends z.ZodObject>(schema: T) => schema.partial().strict();

export const AD_TOOLS = {
  build_meta_template: {
    description: "Build a Meta campaign/ad set/ad template for the current attack package. Optional fields override the plan.",
    schema: overrideOf(MetaInputSchema),
  },
  build_tiktok_template: {
    description: "Build a TikTok campaign/ad group/ad template plus a video creative brief. Optional fields override the plan.",
    schema: overrideOf(TikTokInputSchema),
  },
  build_google_template: {
    description: "Build a Google Search campaign with a Responsive Search Ad and keywords. Optional fields override the plan.",
    schema: overrideOf(GoogleInputSchema),
  },
} as const;
export type AdToolName = keyof typeof AD_TOOLS;

export function isAdTool(name: string): name is AdToolName {
  return Object.prototype.hasOwnProperty.call(AD_TOOLS, name);
}

/** JSON Schemas of the tool inputs, for the function-calling `tools` array. */
export function adToolJsonSchemas(): { name: AdToolName; description: string; parameters: unknown }[] {
  return (Object.keys(AD_TOOLS) as AdToolName[]).map((name) => ({
    name,
    description: AD_TOOLS[name].description,
    parameters: z.toJSONSchema(AD_TOOLS[name].schema),
  }));
}

export type AdToolResult = { ok: true; template: PlatformTemplate } | { ok: false; error: string };

/** Run one allowlisted builder tool. Unknown names and invalid arguments are refused, never executed. */
export function runAdTool(name: string, args: unknown, pkg: AttackPackage, opts: GenerateOptions = {}): AdToolResult {
  if (!isAdTool(name)) return { ok: false, error: "unknown tool" };
  const parsed = AD_TOOLS[name].schema.safeParse(args ?? {});
  if (!parsed.success) return { ok: false, error: `invalid arguments: ${parsed.error.issues.map((i) => i.path.join(".") || "(root)").join(", ")}` };
  try {
    if (name === "build_meta_template") {
      const plan = planMeta(pkg, opts);
      const merged = MetaInputSchema.safeParse({ ...plan.input, ...parsed.data });
      if (!merged.success) return { ok: false, error: "invalid arguments" };
      return { ok: true, template: buildMeta(merged.data, contextFrom(pkg, plan.cites)) };
    }
    if (name === "build_tiktok_template") {
      const plan = planTikTok(pkg, opts);
      const merged = TikTokInputSchema.safeParse({ ...plan.input, ...parsed.data });
      if (!merged.success) return { ok: false, error: "invalid arguments" };
      return { ok: true, template: buildTikTok(merged.data, contextFrom(pkg, plan.cites)) };
    }
    const plan = planGoogle(pkg, opts);
    const merged = GoogleInputSchema.safeParse({ ...plan.input, ...parsed.data });
    if (!merged.success) return { ok: false, error: "invalid arguments" };
    return { ok: true, template: buildGoogle(merged.data, contextFrom(pkg, plan.cites)) };
  } catch {
    return { ok: false, error: "template build failed" };
  }
}
