import { NextResponse } from "next/server";

import { requireApiActiveUser } from "@/lib/apiAuth";
import {
  DESKTOP_CLIENT_HEADER,
  DESKTOP_DEVICE_HEADER,
  DESKTOP_TOKEN_HEADER,
  checkSimpleRateLimit,
  heartbeatDesktopSession,
} from "@/lib/desktopAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const authz = await requireApiActiveUser(req);
  if (!authz.ok) return authz.response;

  if (!checkSimpleRateLimit(`desktop_heartbeat_${authz.user.id}`, 120, 60_000)) {
    return NextResponse.json({ message: "心跳过于频繁，请稍后再试。" }, { status: 429 });
  }

  const result = await heartbeatDesktopSession({
    userId: authz.user.id,
    client: req.headers.get(DESKTOP_CLIENT_HEADER)?.trim().toLowerCase() ?? "",
    deviceId: req.headers.get(DESKTOP_DEVICE_HEADER) ?? "",
    token: req.headers.get(DESKTOP_TOKEN_HEADER) ?? "",
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({ expiresAt: result.expiresAt });
}
