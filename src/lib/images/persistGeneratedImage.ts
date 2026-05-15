import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, relative, resolve } from "node:path";

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

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120) || "x";
}

function keyPrefixToSegments(keyPrefix: string): string[] {
  return keyPrefix
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean)
    .map(sanitizeSegment);
}

/** 将 PNG 写入 GEMMUSE_LOCAL_MEDIA_DIR，返回同源可嵌入的 `/api/local-media/...` URL。 */
function persistPngToLocalMedia(args: {
  userId: string;
  keyPrefix: string;
  base64: string;
}): { id: string; url: string } {
  const root = process.env.GEMMUSE_LOCAL_MEDIA_DIR?.trim();
  if (!root) {
    return {
      id: `local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      url: toDataPng(args.base64),
    };
  }
  const id = `local_${Date.now()}_${randomBytes(8).toString("hex")}`;
  const userSeg = sanitizeSegment(args.userId);
  const sub = ["generated", userSeg, ...keyPrefixToSegments(args.keyPrefix)];
  const rootResolved = resolve(root);
  const absDir = resolve(rootResolved, ...sub);
  const relToRoot = relative(rootResolved, absDir);
  if (relToRoot.startsWith("..") || relToRoot === "") {
    throw new Error("persistPngToLocalMedia: path escaped media root");
  }
  mkdirSync(absDir, { recursive: true });
  const fileName = `${randomBytes(16).toString("hex")}.png`;
  const absFile = join(absDir, fileName);
  writeFileSync(absFile, Buffer.from(args.base64, "base64"));
  const urlPath = [...sub, fileName].map(encodeURIComponent).join("/");
  return { id, url: `/api/local-media/${urlPath}` };
}

export async function persistGeneratedImage(args: {
  userId: string;
  taskId?: string;
  kind: string;
  base64: string;
  sourceMainImageId?: string;
  debugPromptZh?: string;
  keyPrefix: string;
  localMode?: boolean;
}): Promise<{ id: string; url: string; objectKey?: string }> {
  if (args.localMode) {
    return persistPngToLocalMedia({
      userId: args.userId,
      keyPrefix: args.keyPrefix,
      base64: args.base64,
    });
  }
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
