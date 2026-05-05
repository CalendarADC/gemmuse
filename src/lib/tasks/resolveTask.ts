import { prisma } from "@/lib/db";

export async function ensureOwnedTaskId(
  userId: string,
  taskId: string,
  opts?: { upsertForDesktop?: boolean },
): Promise<string | null> {
  const id = taskId.trim();
  if (!id) return null;
  let task: { id: string } | null = null;
  try {
    task = await prisma.task.findFirst({
      where: { id, userId },
      select: { id: true },
    });
  } catch {
    if (opts?.upsertForDesktop) return id;
    return null;
  }
  if (task) return task.id;
  if (!opts?.upsertForDesktop) return null;
  try {
    await prisma.task.create({
      data: {
        id,
        userId,
        name: "桌面任务",
        searchLine: "",
        sortOrder: 0,
        currentStep: "STEP1",
        isProtected: false,
      },
    });
    return id;
  } catch {
    try {
      const again = await prisma.task.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      return again?.id ?? null;
    } catch {
      return id;
    }
  }
}

