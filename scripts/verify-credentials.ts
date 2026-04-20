/**
 * One-off: verify email exists and password matches (no secrets printed).
 * Usage: npx tsx scripts/verify-credentials.ts
 */
import { config as loadEnv } from "dotenv";
import { compare } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase() || "dzh970224@gmail.com";
  const plain = process.argv[3] ?? "12345678";

  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL in .env / .env.local");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log("RESULT: no user row for this email in this database.");
    process.exitCode = 2;
    return;
  }

  const match = await compare(plain, user.passwordHash);
  console.log("RESULT:", {
    email: user.email,
    status: user.status,
    role: user.role,
    passwordMatches: match,
  });
  if (!match) {
    console.log("Hint: run npm run seed:admin with ADMIN_EMAIL / ADMIN_PASSWORD to reset.");
    process.exitCode = 3;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
