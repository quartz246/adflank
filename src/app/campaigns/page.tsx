import { redirect } from "next/navigation";
import { currentUser, isGuestUser } from "@/lib/auth/session";
import { buildDashboard } from "@/lib/campaign/dashboard";
import Dashboard from "@/components/dash/Dashboard";
import "@/components/wizard/wizard.css";
import "./campaigns.css";
import "./dashboard.css";

export const dynamic = "force-dynamic";

/** Signed-in home: the agency dashboard across all of the owner's brands. */
export default async function CampaignsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (isGuestUser(user)) redirect("/signup");
  const data = buildDashboard(user);
  return (
    <div className="wz mc">
      <Dashboard data={JSON.parse(JSON.stringify(data))} email={user.email} />
    </div>
  );
}
