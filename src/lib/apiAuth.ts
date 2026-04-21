import { NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

export async function requireApiActiveUser() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "未登录或会话已过期。" }, { status: 401 }),
    };
  }

  let user: { id: string; role: "ADMIN" | "USER"; status: "PENDING" | "ACTIVE" | "DISABLED" | "REJECTED" } | null =
    null;
  try {
    user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, status: true },
    });
  } catch (e) {
    if (!isPrismaPoolBusyError(e)) throw e;
    const sessionStatus = session.user.status ?? "ACTIVE";
    if (sessionStatus !== "ACTIVE") {
      return {
        ok: false as const,
        response: NextResponse.json({ message: "账号不可用，请联系管理员。" }, { status: 403 }),
      };
    }
    user = {
      id: session.user.id,
      role: session.user.role ?? "USER",
      status: "ACTIVE",
    };
  }
  if (!user || user.status !== "ACTIVE") {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "账号不可用，请联系管理员。" }, { status: 403 }),
    };
  }

  return { ok: true as const, user };
}

export async function requireApiAdmin() {
  const base = await requireApiActiveUser();
  if (!base.ok) return base;
  if (base.user.role !== "ADMIN") {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "仅管理员可访问。" }, { status: 403 }),
    };
  }
  return base;
}
