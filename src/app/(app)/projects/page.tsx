import { redirect } from "next/navigation";

/** The signed-in home moved to /campaigns ("My campaigns"); old links land there. */
export default function ProjectsPage() {
  redirect("/campaigns");
}
