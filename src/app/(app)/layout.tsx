import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import LogoutButton from "@/components/core/LogoutButton";
import TopBar from "@/components/core/TopBar";

export const dynamic = "force-dynamic";

/** Everything under (app) requires login. Only the landing page and the auth pages are public. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  // Guests (pasted a website, no account) are sent to signup by each page, which keeps the project id for the claim.
  return (
    <>
      <TopBar href="/projects">
        <Link className="navlink hide-sm" href="/projects">Projects</Link>
        <span className="userchip" title={user.email}>
          <span className="avatar user" aria-hidden>{user.email.slice(0, 1).toUpperCase()}</span>
          <span className="email ellipsis">{user.email}</span>
        </span>
        <LogoutButton />
      </TopBar>
      <main className="wrap">{children}</main>
    </>
  );
}
