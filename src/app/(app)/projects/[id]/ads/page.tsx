import { redirect } from "next/navigation";

/** Retired: projects open on their results page (/go/[id]); the campaign lives at /go/[id]/campaign. */
export default async function Retired({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  redirect(Number.isInteger(id) ? `/go/${id}` : "/projects");
}
