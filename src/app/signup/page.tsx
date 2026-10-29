import { redirect } from "next/navigation";
import AuthForm from "@/components/core/AuthForm";
import AuthShell from "@/components/core/AuthShell";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await currentUser()) redirect("/projects");
  return <AuthShell mode="signup"><AuthForm mode="signup" /></AuthShell>;
}
