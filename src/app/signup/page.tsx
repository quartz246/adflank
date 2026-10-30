import { redirect } from "next/navigation";
import AuthForm from "@/components/core/AuthForm";
import AuthShell from "@/components/core/AuthShell";
import { currentUser, isGuestUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ claim?: string }> }) {
  const u = await currentUser();
  if (u && !isGuestUser(u)) redirect("/projects");
  const claim = Number((await searchParams).claim);
  return <AuthShell mode="signup"><AuthForm mode="signup" next={isGuestUser(u) && Number.isInteger(claim) ? `/go/${claim}/campaign` : undefined} /></AuthShell>;
}
