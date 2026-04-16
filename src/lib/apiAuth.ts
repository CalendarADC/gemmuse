import { NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function requireApiActiveUser() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "未登录或会话已过期。" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, status: true },
  });
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
