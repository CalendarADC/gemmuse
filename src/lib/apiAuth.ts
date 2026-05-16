import { createHash, randomBytes } from "node:crypto";

import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { isKeyOnlyAuthEnabled } from "@/lib/authMode";
import { getAuthSession } from "@/lib/auth";
import { resolveRequestLaoZhangApiKey } from "@/lib/apiLaoZhangKey";
import { prisma } from "@/lib/db";
import { getDesktopDbMode } from "@/lib/desktop/desktopDbMode";
import {
  isDesktopBundledClientRequest,
  isDesktopLocalServerMode,
  isWebLocalClientRequest,
} from "@/lib/runtime/desktopLocalMode";

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

/** 本地开发未配 DATABASE_URL、Prisma 未初始化等：有会话时回退到 JWT 中的用户信息 */
function isPrismaSessionLookupSoftFailError(error: unknown): boolean {
  if (isPrismaPoolBusyError(error)) return true;
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes("Environment variable not found: DATABASE_URL") ||
    msg.includes("PrismaClientInitializationError") ||
    msg.includes("Can't reach database server") ||
    msg.includes("P1001") ||
    msg.includes("P1017")
  );
}

const DESKTOP_RUNTIME_USER_EMAIL =
  process.env.DESKTOP_RUNTIME_USER_EMAIL?.trim() || "gemmuse-desktop-runtime@local.invalid";

export type ApiActiveUser = {
  id: string;
  role: "ADMIN" | "USER";
  status: "PENDING" | "ACTIVE" | "DISABLED" | "REJECTED";
};

export type ApiAuthSource =
  | "session"
  | "api-key"
  | "web-local"
  | "desktop-runtime"
  | "desktop-ephemeral";

export type RequireApiActiveUserResult =
  | { ok: true; user: ApiActiveUser; authSource: ApiAuthSource }
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

function webLocalEphemeralUser(): ApiActiveUser {
  return {
    id: "web-local-user",
    role: "USER",
    status: "ACTIVE",
  };
}

function userFromApiKey(apiKey: string): ApiActiveUser {
  const digest = createHash("sha256").update(apiKey.trim()).digest("hex").slice(0, 24);
  return {
    id: `key-${digest}`,
    role: "USER",
    status: "ACTIVE",
  };
}

function missingApiKeyResponse(): RequireApiActiveUserResult {
  return {
    ok: false as const,
    response: NextResponse.json(
      { message: "请先在页面顶部点击「密钥」填写 API Key，再使用生图等功能。" },
      { status: 401 },
    ),
  };
}

async function resolveDesktopBundledUser(req: Request): Promise<RequireApiActiveUserResult> {
  const dbMode = getDesktopDbMode();
  if (dbMode === "off") {
    return { ok: true as const, user: desktopEphemeralUser(), authSource: "desktop-ephemeral" };
  }
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
    if (dbMode === "on") {
      return {
        ok: false as const,
        response: NextResponse.json(
          {
            message:
              "桌面模式已启用 DESKTOP_DB_MODE=on，但当前无法连接数据库。请检查 DATABASE_URL 与网络。",
          },
          { status: 503 },
        ),
      };
    }
    return { ok: true as const, user: desktopEphemeralUser(), authSource: "desktop-ephemeral" };
  }
}

async function requireApiActiveUserKeyOnly(req: Request): Promise<RequireApiActiveUserResult> {
  const apiKey = resolveRequestLaoZhangApiKey(req);
  if (apiKey) {
    return { ok: true as const, user: userFromApiKey(apiKey), authSource: "api-key" };
  }

  if (isDesktopBundledClientRequest(req)) {
    return resolveDesktopBundledUser(req);
  }

  if (isWebLocalClientRequest(req) || isDesktopLocalServerMode(req)) {
    return { ok: true as const, user: webLocalEphemeralUser(), authSource: "web-local" };
  }

  return missingApiKeyResponse();
}

async function requireApiActiveUserSession(req: Request): Promise<RequireApiActiveUserResult> {
  const session = await getAuthSession();
  if (session?.user?.id) {
    let user: ApiActiveUser | null = null;
    try {
      user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, role: true, status: true },
      });
    } catch (e) {
      if (!isPrismaSessionLookupSoftFailError(e)) throw e;
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
    return resolveDesktopBundledUser(req);
  }

  return {
    ok: false as const,
    response: NextResponse.json({ message: "未登录或会话已过期。" }, { status: 401 }),
  };
}

export async function requireApiActiveUser(req: Request): Promise<RequireApiActiveUserResult> {
  if (isKeyOnlyAuthEnabled()) {
    return requireApiActiveUserKeyOnly(req);
  }
  return requireApiActiveUserSession(req);
}

export async function requireApiAdmin(req: Request): Promise<RequireApiActiveUserResult> {
  if (isKeyOnlyAuthEnabled()) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "管理后台已关闭，请直接使用创作页与 API 密钥。" }, { status: 403 }),
    };
  }
  const base = await requireApiActiveUserSession(req);
  if (!base.ok) return base;
  if (base.user.role !== "ADMIN") {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "仅管理员可访问。" }, { status: 403 }),
    };
  }
  return base;
}
