import { NextResponse } from "next/server";

import { requireApiActiveUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

const privateCacheHeaders = {
  "Cache-Control": "private, no-store, must-revalidate",
};

type TaskStepWire = "STEP1" | "STEP2" | "STEP3" | "STEP4";

function toStep(v: unknown): TaskStepWire | null {
  return v === "STEP1" || v === "STEP2" || v === "STEP3" || v === "STEP4" ? v : null;
}

export async function GET() {
  const authz = await requireApiActiveUser();
  if (!authz.ok) return authz.response;

  let tasks = await prisma.task.findMany({
    where: { userId: authz.user.id },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      searchLine: true,
      isProtected: true,
      sortOrder: true,
      currentStep: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!tasks.length) {
    await prisma.task.create({
      data: { userId: authz.user.id, name: "任务 1", sortOrder: 0 },
    });
    tasks = await prisma.task.findMany({
      where: { userId: authz.user.id },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        searchLine: true,
        isProtected: true,
        sortOrder: true,
        currentStep: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
  return NextResponse.json({ tasks }, { headers: privateCacheHeaders });
}

export async function POST(req: Request) {
  const authz = await requireApiActiveUser();
  if (!authz.ok) return authz.response;
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = String(body.name ?? "").trim().slice(0, 80) || "新任务";
  const max = await prisma.task.aggregate({
    where: { userId: authz.user.id },
    _max: { sortOrder: true },
  });
  const task = await prisma.task.create({
    data: {
      userId: authz.user.id,
      name,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  return NextResponse.json({ task });
}

export async function PATCH(req: Request) {
  const authz = await requireApiActiveUser();
  if (!authz.ok) return authz.response;

  const body = (await req.json().catch(() => ({}))) as {
    taskId?: string;
    name?: string;
    isProtected?: boolean;
    currentStep?: TaskStepWire;
    searchLine?: string;
    sortOrder?: number;
  };

  const taskId = String(body.taskId ?? "").trim();
  if (!taskId) {
    return NextResponse.json({ message: "缺少 taskId" }, { status: 400 });
  }
  const currentStep = toStep(body.currentStep);
  const data: {
    name?: string;
    isProtected?: boolean;
    currentStep?: TaskStepWire;
    searchLine?: string;
    sortOrder?: number;
  } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);
  if (typeof body.isProtected === "boolean") data.isProtected = body.isProtected;
  if (typeof body.searchLine === "string") data.searchLine = body.searchLine.slice(0, 160);
  if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
    data.sortOrder = Math.max(0, Math.floor(body.sortOrder));
  }
  if (currentStep) data.currentStep = currentStep;
  if (!Object.keys(data).length) return NextResponse.json({ ok: true });

  const updated = await prisma.task.updateMany({
    where: { id: taskId, userId: authz.user.id },
    data,
  });
  if (!updated.count) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const authz = await requireApiActiveUser();
  if (!authz.ok) return authz.response;
  const taskId = new URL(req.url).searchParams.get("taskId")?.trim() ?? "";
  if (!taskId) return NextResponse.json({ message: "缺少 taskId" }, { status: 400 });
  const deleted = await prisma.task.deleteMany({
    where: { id: taskId, userId: authz.user.id, isProtected: false },
  });
  if (!deleted.count) return NextResponse.json({ message: "任务不存在或已保护" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

