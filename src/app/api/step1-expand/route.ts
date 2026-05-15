import { NextResponse } from "next/server";

import { expandStep1PromptWithAi } from "@/lib/ai/step1PromptAiExpander";
import { inferJewelryProductKind } from "@/lib/ai/jewelrySoftLimits";
import { requireApiActiveUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

type Body = {
  prompt: string;
  selectedStyles?: string[];
};

export async function POST(req: Request) {
  const authz = await requireApiActiveUser(req);
  if (!authz.ok) return authz.response;

  const body = (await req.json().catch(() => ({}))) as Partial<Body>;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const selectedStyles = Array.isArray(body.selectedStyles) ? body.selectedStyles.filter(Boolean) : [];
  if (!prompt.trim()) {
    return NextResponse.json({ message: "缺少 prompt" }, { status: 400 });
  }

  try {
    const kind = inferJewelryProductKind(prompt);
    const result = await expandStep1PromptWithAi({ prompt, kind, selectedStyles });
    return NextResponse.json({
      expandedPrompt: result.expandedPrompt,
      model: result.model,
      kind,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Step1 改写失败";
    return NextResponse.json({ message }, { status: 500 });
  }
}

