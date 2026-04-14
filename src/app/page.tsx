import { redirect } from "next/navigation";

import { getAuthSession } from "@/lib/auth";

export default async function Home() {
  const session = await getAuthSession();
  if (!session?.user) redirect("/login");
  if (session.user.status === "PENDING") redirect("/pending");
  redirect("/create/design");
}
