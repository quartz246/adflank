import { getLlm } from "@/lib/llm";
import { qlooMode } from "@/lib/qloo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness plus which modes are active. No secrets, paths or hosts. */
export async function GET() {
  const llm = getLlm();
  return Response.json({ ok: true, llmModel: llm.mode === "mock" ? "mock-llm" : llm.lastModel(), llmConfigured: llm.mode === "mock" ? "mock" : llm.configuredModel, qlooMode: qlooMode() }, { headers: { "cache-control": "no-store" } });
}
