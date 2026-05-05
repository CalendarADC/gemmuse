import { randomBytes } from "node:crypto";

import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDesktopBundledClientRequest } from "@/lib/runtime/desktopLocalMode";

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

const DESKTOP_RUNTIME_USER_EMAIL =
  process.env.DESKTOP_RUNTIME_USER_EMAIL?.trim() || "gemmuse-desktop-runtime@local.invalid";

export type ApiActiveUser = {
  id: string;
  role: "ADMIN" | "USER";
  status: "PENDING" | "ACTIVE" | "DISABLED" | "REJECTED";
};

export type RequireApiActiveUserResult =
  | { ok: true; user: ApiActiveUser; authSource: "session" | "desktop-runtime" | "desktop-ephemeral" }
  | { ok: false; response: NextResponse };

async function getOrCreateDesktopRuntimeUser(): Promise<ApiActiveUser> {
  const passwordHash = await hash(randomBytes(24).toString("base64url"), 10);
  const row = await prisma.user.upsert({
    where: { email: DESKTOP_RUNTIME_USER_EMAIL },
    update: { status: "ACTIVE", role: "ADMIN" },
    create: {
      email: DESKTOP_RUNTIME_USER_EMAIL,
      name: "GemMuse Desktop",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
    select: { id: true, role: true, status: true },
  });
  return { id: row.id, role: row.role, status: row.status };
}

function desktopEphemeralUser(): ApiActiveUser {
  return {
    id: "desktop-local-user",
    role: "ADMIN",
    status: "ACTIVE",
  };
}

export async function requireApiActiveUser(req: Request): Promise<RequireApiActiveUserResult> {
  const session = await getAuthSession();
  if (session?.user?.id) {
    let user: ApiActiveUser | null = null;
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
    return { ok: true as const, user, authSource: "session" };
  }

  if (isDesktopBundledClientRequest(req)) {
    try {
      const user = await getOrCreateDesktopRuntimeUser();
      if (user.status !== "ACTIVE") {
        return {
          ok: false as const,
          response: NextResponse.json({ message: "账号不可用，请联系管理员。" }, { status: 403 }),
        };
      }
      return { ok: true as const, user, authSource: "desktop-runtime" };
    } catch (e) {
      console.error("[requireApiActiveUser] desktop-runtime user:", e);
      // 数据库短时不可用时，桌面模式降级为本地临时账号，避免阻断扩写/生图流程。
      return { ok: true as const, user: desktopEphemeralUser(), authSource: "desktop-ephemeral" };
    }
  }

  return {
    ok: false as const,
    response: NextResponse.json({ message: "未登录或会话已过期。" }, { status: 401 }),
  };
}

export async function requireApiAdmin(req: Request): Promise<RequireApiActiveUserResult> {
  const base = await requireApiActiveUser(req);
  if (!base.ok) return base;
  if (base.user.role !== "ADMIN") {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "仅管理员可访问。" }, { status: 403 }),
    };
  }
  return base;
}
