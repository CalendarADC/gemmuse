import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/authOptions";
import { isKeyOnlyAuthEnabled } from "@/lib/authMode";
import { prisma } from "@/lib/db";
import { isDesktopLocalServerMode } from "@/lib/runtime/desktopLocalMode";

export async function getAuthSession() {
  return getServerSession(authOptions);
}

function isPrismaPoolBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes("Timed out fetching a new connection from the connection pool") ||
    msg.includes("canceling statement due to statement timeout") ||
    msg.includes("code: '57014'") ||
    msg.includes("P1008")
  );
}

export async function requireActiveUser() {
  if (isKeyOnlyAuthEnabled() || isDesktopLocalServerMode()) {
    return {
      id: isKeyOnlyAuthEnabled() ? "web-local-user" : "desktop-local-user",
      email: null,
      name: isKeyOnlyAuthEnabled() ? "GemMuse User" : "Desktop Local User",
      role: "USER" as const,
      status: "ACTIVE" as const,
    };
  }

  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/create/design");

  let user: {
    id: string;
    email: string | null;
    name: string | null;
    role: "ADMIN" | "USER";
    status: "PENDING" | "ACTIVE" | "DISABLED" | "REJECTED";
  } | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
      },
    });
  } catch (e) {
    if (!isPrismaPoolBusyError(e)) throw e;
    const sessionStatus = session.user.status ?? "ACTIVE";
    if (sessionStatus !== "ACTIVE") {
      redirect("/create/design");
    }
    user = {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      role: session.user.role ?? "USER",
      status: "ACTIVE",
    };
  }

  if (!user) redirect("/create/design");
  if (user.status !== "ACTIVE") redirect("/create/design");

  return user;
}

export async function requireAdminUser() {
  const user = await requireActiveUser();
  if (user.role !== "ADMIN") redirect("/create/design");
  return user;
}
