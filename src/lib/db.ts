import { PrismaClient } from "@prisma/client";

import { buildRuntimeDatabaseUrl } from "@/lib/databaseUrl";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrisma(): PrismaClient {
  try {
    const url = buildRuntimeDatabaseUrl();
    return new PrismaClient({
      datasources: { db: { url } },
    });
  } catch {
    return new PrismaClient();
  }
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
