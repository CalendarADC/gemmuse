import { NextResponse } from "next/server";

import { requireApiActiveUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const authz = await requireApiActiveUser();
  if (!authz.ok) return authz.response;

  const reqUrl = new URL(req.url);
  const sourceUrl = reqUrl.searchParams.get("url")?.trim() ?? "";
  if (!sourceUrl) {
    return NextResponse.json({ message: "缺少下载地址。" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return NextResponse.json({ message: "仅支持 http(s) 下载地址。" }, { status: 400 });
  }

  try {
    const upstream = await fetch(sourceUrl, { method: "GET", redirect: "follow" });
    if (!upstream.ok) {
      return NextResponse.json(
        { message: `下载源不可用（HTTP ${upstream.status}）。` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message =
      e instanceof Error && e.message.trim()
        ? e.message
        : "下载失败：无法读取图片源。";
    return NextResponse.json({ message }, { status: 502 });
  }
}
