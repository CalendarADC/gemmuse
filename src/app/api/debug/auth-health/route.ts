import { NextResponse } from "next/server";
import { compare } from "bcryptjs";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function dbHostFromUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || "(default)"}`;
  } catch {
    return "invalid_database_url";
  }
}

export async function GET(req: Request) {
  const search = new URL(req.url).searchParams;
  const token = req.headers.get("x-debug-token") || search.get("token") || "";
  const expected = process.env.DEBUG_HEALTH_TOKEN || "";
  if (!expected || token !== expected) {
    return NextResponse.json({ message: "forbidden" }, { status: 403 });
  }

  const url = process.env.DATABASE_URL || "";
  const host = dbHostFromUrl(url);
  const q = search;
  const email = (q.get("email") || "dzh970224@gmail.com").trim().toLowerCase();
  const password = q.get("password") || "";

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      passwordHash: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const passwordOk = user && password ? await compare(password, user.passwordHash) : null;

  return NextResponse.json({
    ok: true,
    dbHost: host,
    usingDirectSupabaseHost: host.includes("db.twkqskxdjmpcfbqvlohl.supabase.co:5432"),
    usingPoolerHost: host.includes("pooler.supabase.com"),
    user: user
      ? {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          hasPasswordHash: !!user.passwordHash,
        }
      : null,
    passwordOk,
  });
}
