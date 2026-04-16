import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";

export const DESKTOP_CLIENT_HEADER = "x-desktop-client";
export const DESKTOP_DEVICE_HEADER = "x-desktop-device-id";
export const DESKTOP_TOKEN_HEADER = "x-desktop-access-token";
export const DESKTOP_CLIENT_VALUE = "electron";
const DESKTOP_SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

const windowHits = new Map<string, number[]>();
export function checkSimpleRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = windowHits.get(key) ?? [];
  const recent = arr.filter((ts) => now - ts < windowMs);
  recent.push(now);
  windowHits.set(key, recent);
  return recent.length <= limit;
}

export function hashDesktopToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeDeviceId(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 200);
}

export function normalizeDeviceName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 120);
}

function issueDesktopToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashDesktopToken(token);
  const expiresAt = new Date(Date.now() + DESKTOP_SESSION_TTL_MS);
  return { token, tokenHash, expiresAt };
}

export async function activateDesktopDevice(args: {
  userId: string;
  deviceId: string;
  deviceName: string;
}) {
  const deviceIdHash = normalizeDeviceId(args.deviceId);
  const deviceName = normalizeDeviceName(args.deviceName || "Desktop Device");
  if (!deviceIdHash) {
    return { ok: false as const, status: 400, message: "缺少设备标识。" };
  }

  let device = await prisma.desktopDevice.findUnique({
    where: { userId_deviceIdHash: { userId: args.userId, deviceIdHash } },
  });

  if (!device) {
    device = await prisma.desktopDevice.create({
      data: {
        userId: args.userId,
        deviceIdHash,
        deviceName,
        status: "PENDING",
      },
    });
  } else if (device.deviceName !== deviceName && deviceName) {
    device = await prisma.desktopDevice.update({
      where: { id: device.id },
      data: { deviceName },
    });
  }

  if (device.status === "REVOKED") {
    return { ok: false as const, status: 403, message: "当前设备已被管理员禁用。" };
  }
  if (device.status !== "APPROVED") {
    return { ok: false as const, status: 403, message: "设备待管理员审批后可用。" };
  }

  const { token, tokenHash, expiresAt } = issueDesktopToken();
  const session = await prisma.desktopSession.create({
    data: {
      userId: args.userId,
      deviceId: device.id,
      tokenHash,
      expiresAt,
      lastSeenAt: new Date(),
    },
    select: { id: true },
  });

  await prisma.desktopDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  return {
    ok: true as const,
    token,
    expiresAt: expiresAt.toISOString(),
    sessionId: session.id,
    deviceId: device.id,
  };
}

export async function validateDesktopAccess(args: {
  userId: string;
  client: string;
  deviceId: string;
  token: string;
}) {
  if (args.client !== DESKTOP_CLIENT_VALUE) {
    return { ok: false as const, status: 403, message: "仅桌面客户端可调用该功能。" };
  }
  const deviceIdHash = normalizeDeviceId(args.deviceId);
  const token = args.token.trim();
  if (!deviceIdHash || !token) {
    return { ok: false as const, status: 401, message: "缺少桌面授权信息。" };
  }

  const tokenHash = hashDesktopToken(token);
  const session = await prisma.desktopSession.findUnique({
    where: { tokenHash },
    include: { device: true },
  });
  if (!session || session.userId !== args.userId) {
    return { ok: false as const, status: 401, message: "桌面会话无效，请重新激活。" };
  }
  if (session.revokedAt) {
    return { ok: false as const, status: 403, message: "桌面会话已失效，请重新激活。" };
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    return { ok: false as const, status: 401, message: "桌面会话已过期，请重新激活。" };
  }
  if (session.device.status !== "APPROVED") {
    return { ok: false as const, status: 403, message: "设备权限不可用，请联系管理员。" };
  }
  if (session.device.deviceIdHash !== deviceIdHash) {
    return { ok: false as const, status: 403, message: "设备标识不匹配，请重新激活。" };
  }

  return { ok: true as const, session, deviceIdHash };
}

export async function heartbeatDesktopSession(args: {
  userId: string;
  client: string;
  deviceId: string;
  token: string;
}) {
  const valid = await validateDesktopAccess(args);
  if (!valid.ok) return valid;

  const expiresAt = new Date(Date.now() + DESKTOP_SESSION_TTL_MS);
  await prisma.desktopSession.update({
    where: { id: valid.session.id },
    data: { lastSeenAt: new Date(), expiresAt },
  });
  await prisma.desktopDevice.update({
    where: { id: valid.session.deviceId },
    data: { lastSeenAt: new Date() },
  });
  return { ok: true as const, expiresAt: expiresAt.toISOString() };
}
