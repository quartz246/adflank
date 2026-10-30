import { notFound, redirect } from "next/navigation";
import { currentUser, isGuestUser } from "@/lib/auth/session";
import { projects } from "@/lib/db/repo";
import { wizardView } from "@/lib/agent/wizard-view";
import type { AttackPackage } from "@/lib/types/attack";
import CampaignManager from "@/components/wizard/CampaignManager";
import "@/components/wizard/wizard.css";

export const dynamic = "force-dynamic";

/** Campaign manager (proof of concept): the ad categories as ad sets, with Qloo levers. Nothing is sent to ad platforms. */
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/");
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? projects.owned(id, user.id) : undefined;
  if (!p) notFound();
  const v = wizardView(p, user);
  if (!("comps" in v) || !v.comps.length || !v.comps.every((c) => c.done)) redirect(`/go/${p.id}`);
  const pkgs = JSON.parse(JSON.stringify(v.comps.map((c) => c.pkg))) as AttackPackage[];
  return <CampaignManager projectId={p.id} brand={v.brand?.name ?? p.name} pkgs={pkgs} guest={isGuestUser(user)} />;
}
