import { toDataPng } from "@/lib/ai/AIService";
import { runSerializedPersist } from "@/lib/db/persistWriteQueue";
import { prisma } from "@/lib/db";
import { uploadPngBase64ToObjectStorage } from "@/lib/storage/objectStorage";

const PRISMA_POOL_TIMEOUT_HINT = "Timed out fetching a new connection from the connection pool";
const PRISMA_STATEMENT_TIMEOUT_HINT = "canceling statement due to statement timeout";
const PERSIST_CREATE_MAX_ATTEMPTS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientPrismaPersistError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes(PRISMA_POOL_TIMEOUT_HINT) ||
    msg.includes(PRISMA_STATEMENT_TIMEOUT_HINT) ||
    msg.includes("code: '57014'") ||
    msg.includes("code: '40001'") || // serialization failure
    msg.includes("code: '40P01'") || // deadlock detected
    msg.includes("P1008") // operations timed out
  );
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
        if (!isTransientPrismaPersistError(error) || attempt >= PERSIST_CREATE_MAX_ATTEMPTS) {
          throw error;
        }
        const backoffMs = 400 * attempt * attempt;
        await sleep(backoffMs);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("persistGeneratedImage failed");
  });
}
