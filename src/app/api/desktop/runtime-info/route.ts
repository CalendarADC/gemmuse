import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getDesktopDbMode } from "@/lib/desktop/desktopDbMode";
import { isDesktopBundledClientRequest } from "@/lib/runtime/desktopLocalMode";

export const dynamic = "force-dynamic";

function envEnabled(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "on";
}

/** 桌面壳内页面用于展示「无库 / 降级」等状态；需带 x-gemmuse-desktop-local。 */
export async function GET(req: Request) {
  if (!isDesktopBundledClientRequest(req)) {
    return NextResponse.json({ message: "forbidden" }, { status: 403 });
  }
  const dbMode = getDesktopDbMode();
  let databaseReachable: boolean | null = null;
  if (dbMode !== "off") {
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      databaseReachable = true;
    } catch {
      databaseReachable = false;
    }
  }
  const mediaDir = process.env.GEMMUSE_LOCAL_MEDIA_DIR?.trim() || null;
  return NextResponse.json({
    dbMode,
    databaseReachable,
    localMediaConfigured: !!mediaDir,
    localImageStorageEnabled: envEnabled(process.env.DESKTOP_LOCAL_IMAGE_STORAGE),
  });
}
