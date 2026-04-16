import { NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  DESKTOP_CLIENT_HEADER,
  DESKTOP_DEVICE_HEADER,
  DESKTOP_TOKEN_HEADER,
  validateDesktopAccess,
} from "@/lib/desktopAuth";

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

export async function requireApiDesktopAuthorized(req: Request) {
  const base = await requireApiActiveUser();
  if (!base.ok) return base;

  const access = await validateDesktopAccess({
    userId: base.user.id,
    client: req.headers.get(DESKTOP_CLIENT_HEADER)?.trim().toLowerCase() ?? "",
    deviceId: req.headers.get(DESKTOP_DEVICE_HEADER) ?? "",
    token: req.headers.get(DESKTOP_TOKEN_HEADER) ?? "",
  });
  if (!access.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: access.message }, { status: access.status }),
    };
  }
  return { ok: true as const, user: base.user, desktopSession: access.session };
}
