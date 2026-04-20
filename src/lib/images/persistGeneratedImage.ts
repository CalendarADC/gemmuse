import { toDataPng } from "@/lib/ai/AIService";
import { runSerializedPersist } from "@/lib/db/persistWriteQueue";
import { prisma } from "@/lib/db";
import { uploadPngBase64ToObjectStorage } from "@/lib/storage/objectStorage";

export async function persistGeneratedImage(args: {
  userId: string;
  taskId?: string;
  kind: string;
  base64: string;
  sourceMainImageId?: string;
  debugPromptZh?: string;
  keyPrefix: string;
}): Promise<{ id: string; url: string; objectKey?: string }> {
  const objectKey = `${args.keyPrefix}/${Date.now()}_${Math.random().toString(16).slice(2)}.png`;
  const uploaded = await uploadPngBase64ToObjectStorage({
    base64: args.base64,
    key: objectKey,
  });

  const url = uploaded?.url ?? toDataPng(args.base64);

  return runSerializedPersist(async () => {
    const row = await prisma.generatedImage.create({
      data: {
        userId: args.userId,
        taskId: args.taskId ?? null,
        kind: args.kind,
        sourceMainImageId: args.sourceMainImageId ?? null,
        objectKey: uploaded?.objectKey ?? null,
        url,
        debugPromptZh: args.debugPromptZh ?? null,
      },
      select: { id: true },
    });

    return {
      id: row.id,
      url,
      objectKey: uploaded?.objectKey,
    };
  });
}
