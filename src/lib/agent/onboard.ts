import { getQloo } from "@/lib/qloo/client";
import { audit } from "@/lib/db/repo";
import { readSite } from "@/lib/site/read";
import { clip, sanitizeText } from "@/lib/util/sanitize";
import { gateToolCall, runGatedTool } from "./tools";

/**
 * Onboarding lookups ("Set it up step by step"): read the brand's site, find it in Qloo and list the brands its fans also
 * like, so the owner can tick the rivals before the agents start; or look one rival up by name. Code-only (no model),
 * every call through the same tool gate as the agents, audited without a project.
 */
export interface Rival { id: string; name: string; popularity?: number; note?: string }

const sink = (r: { tool: string; args: string; decision: "accepted" | "dropped"; reason: string }) => audit.add({ project_id: null, source: "onboard", ...r });

async function describe(name: string): Promise<{ found?: Rival; candidates: Rival[] }> {
  const g = gateToolCall("qloo_describe", { entity: name, type: "brand" }, sink);
  if (!g.ok) return { candidates: [] };
  const res = await runGatedTool(getQloo(), g.name, g.args);
  const e = (res.data.entity ?? {}) as { id?: string; name?: string; popularity?: number; description?: string };
  if (res.ok && e.id && e.name) return { found: { id: e.id, name: e.name, popularity: e.popularity, note: e.description }, candidates: [] };
  const issues = (res.data.issues as Array<{ candidates?: Array<{ id?: string; name?: string }> }> | undefined) ?? [];
  const candidates = issues.flatMap((i) => i.candidates ?? []).filter((c): c is { id: string; name: string } => Boolean(c?.id && c?.name)).slice(0, 6);
  return { candidates: candidates.map((c) => ({ id: c.id, name: c.name })) };
}

export async function suggestRivals(url: string): Promise<{ brand: { name: string; found: boolean; note?: string }; site: { domain: string; title: string }; rivals: Rival[] }> {
  const site = await readSite(url);
  const brandName = site.name;
  const d = await describe(brandName);
  const exact = d.found ?? d.candidates.find((c) => c.name.toLowerCase() === brandName.toLowerCase());
  const rivals: Rival[] = [];
  if (exact) {
    const g = gateToolCall("qloo_recommend", { target_type: "brand", signals: [exact.id], limit: 12 }, sink);
    if (g.ok) {
      const res = await runGatedTool(getQloo(), g.name, g.args);
      for (const it of (res.data.items as Array<{ id?: string; name?: string; popularity?: number }> | undefined) ?? []) {
        if (it.id && it.name && it.name.toLowerCase() !== brandName.toLowerCase()) rivals.push({ id: it.id, name: it.name, popularity: it.popularity });
      }
    }
  }
  return {
    brand: { name: brandName, found: Boolean(exact), note: d.found?.note ? clip(sanitizeText(d.found.note), 160) : undefined },
    site: { domain: site.domain, title: clip(sanitizeText(site.title || ""), 90) },
    rivals: rivals.slice(0, 12),
  };
}

export async function searchRival(name: string): Promise<Rival[]> {
  const d = await describe(name);
  return d.found ? [d.found] : d.candidates;
}
