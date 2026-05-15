import { NextResponse } from "next/server";

import { collectDesktopStartupStatus } from "@/lib/desktop/desktopStartupChecks";

export const dynamic = "force-dynamic";

/** 供桌面安装包启动窗拉取；仅反映本机环境与内置服务状态。 */
export async function GET() {
  const status = await collectDesktopStartupStatus();
  return NextResponse.json(status);
}
