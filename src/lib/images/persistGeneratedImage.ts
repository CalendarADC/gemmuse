import { toDataPng } from "@/lib/ai/AIService";
import { runSerializedPersist } from "@/lib/db/persistWriteQueue";
import { prisma } from "@/lib/db";
import { uploadPngBase64ToObjectStorage } from "@/lib/storage/objectStorage";

const PRISMA_POOL_TIMEOUT_HINT = "Timed out fetching a new connection from the connection pool";
const PERSIST_CREATE_MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPrismaPoolTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(PRISMA_POOL_TIMEOUT_HINT);
}

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
    let lastError: unknown;
    for (let attempt = 1; attempt <= PERSIST_CREATE_MAX_ATTEMPTS; attempt++) {
      try {
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
      } catch (error) {
        lastError = error;
        if (!isPrismaPoolTimeoutError(error) || attempt >= PERSIST_CREATE_MAX_ATTEMPTS) {
          throw error;
        }
        const backoffMs = 350 * attempt * attempt;
        await sleep(backoffMs);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("persistGeneratedImage failed");
  });
}
