import { prisma } from "@/lib/db";

export async function ensureOwnedTaskId(userId: string, taskId: string): Promise<string | null> {
  const id = taskId.trim();
  if (!id) return null;
  const task = await prisma.task.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  return task?.id ?? null;
}

