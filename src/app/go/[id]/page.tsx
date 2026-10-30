import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { projects } from "@/lib/db/repo";
import { wizardView } from "@/lib/agent/wizard-view";
import Wizard from "@/components/wizard/Wizard";
import "@/components/wizard/wizard.css";

export const dynamic = "force-dynamic";

/** The website flow: six live steps from a pasted website to finished ad templates. */
export default async function GoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/");
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? projects.owned(id, user.id) : undefined;
  if (!p) notFound();
  return <Wizard projectId={p.id} initial={JSON.parse(JSON.stringify(wizardView(p, user)))} />;
}
