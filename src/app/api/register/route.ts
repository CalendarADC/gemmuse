import { NextResponse } from "next/server";
import { hash } from "bcryptjs";

import { isKeyOnlyAuthEnabled } from "@/lib/authMode";
import { prisma } from "@/lib/db";

type Body = {
  email?: string;
  password?: string;
  name?: string;
};

export async function POST(req: Request) {
  if (isKeyOnlyAuthEnabled()) {
    return NextResponse.json(
      { message: "注册已关闭，请打开创作页，在顶部「密钥」中填写 API Key 后使用。" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password?.trim() ?? "";
  const name = body.name?.trim() ?? "";

  if (!email || !password) {
    return NextResponse.json({ message: "缺少邮箱或密码。" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ message: "密码至少 8 位。" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ message: "该邮箱已注册。" }, { status: 409 });
  }

  const passwordHash = await hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      name: name || null,
      passwordHash,
      status: "PENDING",
      role: "USER",
    },
    select: { id: true },
  });

  return NextResponse.json({
    ok: true,
    message: "注册成功，等待管理员审核后可登录。",
  });
}
