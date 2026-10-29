import { entities } from "@/lib/db/repo";
import type { SlimResult } from "./tools";

export interface Candidate {
  id: string;
  name: string;
  type?: string;
}

/** Store the outcome of a qloo_describe check for one entity. */
export function resolveEntity(entityId: number, input: string, res: SlimResult): { status: "found" | "not_found" | "ambiguous"; candidates: Candidate[] } {
  const ent = (res.data.entity ?? {}) as { id?: string; name?: string; type?: string };
  if (res.ok && ent.id) {
    entities.setResolution(entityId, { status: "found", qloo_id: ent.id, qloo_type: ent.type ?? "urn:entity:brand", qloo_name: ent.name ?? input });
    return { status: "found", candidates: [] };
  }
  const issues = (res.data.issues as Array<{ candidates?: Candidate[] }> | undefined) ?? [];
  const candidates = issues.flatMap((i) => i.candidates ?? []).filter((c) => c && c.id && c.name).slice(0, 6);
  const exact = candidates.filter((c) => c.name.toLowerCase() === input.trim().toLowerCase());
  const status = exact.length > 0 ? "ambiguous" : "not_found";
  entities.setResolution(entityId, { status, candidates });
  return { status, candidates };
}

/** The owner picked one of the candidates. */
export function pickCandidate(entityId: number, candidate: Candidate): void {
  entities.setResolution(entityId, { status: "found", qloo_id: candidate.id, qloo_type: candidate.type ?? "urn:entity:brand", qloo_name: candidate.name });
}
