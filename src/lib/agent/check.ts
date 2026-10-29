import { audit, entities, type EntityRow } from "@/lib/db/repo";
import { getQloo } from "@/lib/qloo/client";
import { gateToolCall, runGatedTool } from "./tools";
import { resolveEntity, type Candidate } from "./resolve";

/** Run qloo_describe for a newly added brand/competitor and store found / not found / candidates. */
export async function checkEntity(e: EntityRow): Promise<{ entity: EntityRow; candidates: Candidate[] }> {
  const g = gateToolCall("qloo_describe", { entity: e.name, type: "brand" }, (r) => audit.add({ project_id: e.project_id, source: "describe", ...r }));
  if (!g.ok) {
    entities.setResolution(e.id, { status: "not_found" });
    return { entity: entities.byId(e.id)!, candidates: [] };
  }
  const res = await runGatedTool(getQloo(), g.name, g.args);
  if (res.status === "error") return { entity: entities.byId(e.id)!, candidates: [] }; // stays unchecked; the run retries
  const out = resolveEntity(e.id, e.name, res);
  return { entity: entities.byId(e.id)!, candidates: out.candidates };
}

export const NAME_RE = /^[\p{L}\p{N}\p{M} &'’.,:()!+\-_/#@]+$/u;
