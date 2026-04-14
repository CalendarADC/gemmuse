import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/db";

export async function getAuthSession() {
  return getServerSession(authOptions);
}

export async function requireActiveUser() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
    },
  });

  if (!user) redirect("/login");
  if (user.status === "PENDING") redirect("/pending");
  if (user.status !== "ACTIVE") redirect("/login");

  return user;
}

export async function requireAdminUser() {
  const user = await requireActiveUser();
  if (user.role !== "ADMIN") redirect("/create/design");
  return user;
}
