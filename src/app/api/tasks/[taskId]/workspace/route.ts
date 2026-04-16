import { NextResponse } from "next/server";

import { requireApiActiveUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const authz = await requireApiActiveUser();
  if (!authz.ok) return authz.response;

  const { taskId } = await ctx.params;
  const id = taskId?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ message: "缺少 taskId" }, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: { id, userId: authz.user.id },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }

  const [images, latestCopy] = await Promise.all([
    prisma.generatedImage.findMany({
      where: { userId: authz.user.id, taskId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        kind: true,
        url: true,
        sourceMainImageId: true,
        debugPromptZh: true,
        createdAt: true,
      },
    }),
    prisma.generatedCopywriting.findFirst({
      where: { userId: authz.user.id, taskId: id },
      orderBy: { createdAt: "desc" },
      select: {
        title: true,
        tags: true,
        description: true,
        debugUsedModel: true,
        debugImageCount: true,
      },
    }),
  ]);

  const copywriting = latestCopy
    ? {
        title: latestCopy.title,
        tags: Array.isArray(latestCopy.tags)
          ? (latestCopy.tags as unknown[]).filter((t): t is string => typeof t === "string")
          : [],
        description: latestCopy.description,
        lastTextModelUsed: latestCopy.debugUsedModel ?? null,
        lastImageCountPassed:
          typeof latestCopy.debugImageCount === "number" ? latestCopy.debugImageCount : null,
      }
    : null;

  return NextResponse.json({
    images: images.map((r: (typeof images)[number]) => ({
      id: r.id,
      kind: r.kind,
      url: r.url,
      sourceMainImageId: r.sourceMainImageId,
      debugPromptZh: r.debugPromptZh,
      createdAt: r.createdAt.toISOString(),
    })),
    copywriting,
  });
}
