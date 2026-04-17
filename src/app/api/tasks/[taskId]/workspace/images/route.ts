import { NextResponse } from "next/server";

import { requireApiActiveUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const MAX_IDS = 48;

/**
 * 从当前任务的云端工作区删除指定生成图（主图 id 及其派生展示图的 sourceMainImageId 关联行一并删），
 * 否则仅删本地时刷新会由 GET workspace 再次合并回来。
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const authz = await requireApiActiveUser();
  if (!authz.ok) return authz.response;

  const { taskId } = await ctx.params;
  const id = taskId?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ message: "缺少 taskId" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? body.ids
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim())
        .slice(0, MAX_IDS)
    : [];
  if (!ids.length) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const task = await prisma.task.findFirst({
    where: { id, userId: authz.user.id },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }

  const result = await prisma.generatedImage.deleteMany({
    where: {
      userId: authz.user.id,
      taskId: id,
      OR: [{ id: { in: ids } }, { sourceMainImageId: { in: ids } }],
    },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
