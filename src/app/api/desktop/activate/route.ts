import { NextResponse } from "next/server";

import { requireApiActiveUser } from "@/lib/apiAuth";
import {
  checkSimpleRateLimit,
  activateDesktopDevice,
  DESKTOP_CLIENT_VALUE,
} from "@/lib/desktopAuth";

export const runtime = "nodejs";

type Body = {
  client?: string;
  deviceId?: string;
  deviceName?: string;
};

export async function POST(req: Request) {
  const authz = await requireApiActiveUser();
  if (!authz.ok) return authz.response;

  if (!checkSimpleRateLimit(`desktop_activate_${authz.user.id}`, 24, 60_000)) {
    return NextResponse.json({ message: "请求过于频繁，请稍后再试。" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const client = typeof body.client === "string" ? body.client.trim().toLowerCase() : "";
  if (client !== DESKTOP_CLIENT_VALUE) {
    return NextResponse.json({ message: "当前请求不是桌面客户端。" }, { status: 400 });
  }

  const result = await activateDesktopDevice({
    userId: authz.user.id,
    deviceId: typeof body.deviceId === "string" ? body.deviceId : "",
    deviceName: typeof body.deviceName === "string" ? body.deviceName : "Desktop Device",
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({
    accessToken: result.token,
    expiresAt: result.expiresAt,
    sessionId: result.sessionId,
    deviceId: result.deviceId,
  });
}
