import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ segments: string[] }> },
) {
  const root = process.env.GEMMUSE_LOCAL_MEDIA_DIR?.trim();
  if (!root) {
    return NextResponse.json({ message: "GEMMUSE_LOCAL_MEDIA_DIR not set" }, { status: 503 });
  }
  const { segments } = await ctx.params;
  if (!segments?.length) {
    return new NextResponse(null, { status: 404 });
  }
  if (segments.some((s) => s === ".." || s.includes("..") || s.includes("\0"))) {
    return new NextResponse(null, { status: 400 });
  }
  const rootResolved = resolve(root);
  const fileResolved = resolve(rootResolved, ...segments);
  const rel = relative(rootResolved, fileResolved);
  if (rel.startsWith("..") || rel === "") {
    return new NextResponse(null, { status: 403 });
  }
  try {
    const buf = await readFile(fileResolved);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
