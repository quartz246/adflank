import { notFound, redirect } from "next/navigation";
import { currentSessionHash, currentUser } from "@/lib/auth/session";
import { isDemoUser } from "@/lib/demo";
import { projects } from "@/lib/db/repo";
import { publicProjectView, runState } from "@/lib/agent/views";
import ProjectClient from "@/components/core/ProjectClient";
import { getLlm } from "@/lib/llm";
import { qlooMode } from "@/lib/qloo/client";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? projects.owned(id, user.id) : undefined;
  if (!p) notFound();
  const view = publicProjectView(p, isDemoUser(user) ? await currentSessionHash() : undefined);
  const board = view.lastRunId ? runState(view.lastRunId) : null;
  const llm = getLlm();
  return <ProjectClient initial={view} initialBoard={board ? JSON.parse(JSON.stringify(board)) : null} modes={{ llm: llm.mode === "mock" ? "mock" : llm.configuredModel, qloo: qlooMode() }} demo={isDemoUser(user)} />;
}
