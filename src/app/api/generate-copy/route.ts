import { NextResponse } from "next/server";

import type { Copywriting, GalleryImage } from "@/store/jewelryGeneratorStore";
import { laoZhangChatCompletionSingleModel } from "@/lib/ai/laoZhangChatClient";
import { requireApiActiveUser } from "@/lib/apiAuth";

type Body = {
  provider: string;
  prompt: string;
  selectedMainImageId: string;
  /** Step2 主图 URL（data URL 或 https），无 Step3 时用于多模态识图 */
  selectedMainImageUrl?: string;
  galleryImages: GalleryImage[];
};

function collectVisionImageUrls(
  gallery: GalleryImage[],
  fallbackMainUrl?: string
): string[] {
  const order = (t: string) => {
    if (t === "main") return 0;
    if (t === "on_model") return 1;
    if (t === "top" || t === "front" || t === "left" || t === "right" || t === "rear" || t === "side")
      return 2;
    return 3;
  };
  const sorted = [...gallery].sort((a, b) => order(a.type) - order(b.type));
  const urls: string[] = [];
  const seen = new Set<string>();
  const fb = fallbackMainUrl?.trim();
  const typeCount: Record<
    "main" | "on_model" | "left" | "right" | "rear" | "front",
    number
  > = {
    main: 0,
    on_model: 0,
    left: 0,
    right: 0,
    rear: 0,
    front: 0,
  };
  for (const g of sorted) {
    const u = g.url?.trim();
    if (!u) continue;
    if (seen.has(u)) continue;

    // 旧版「侧视图」→ 左侧槽位；旧版「俯视图 top」→ 正视图 front 槽位
    const rawType = g.type as string;
    const t: keyof typeof typeCount =
      rawType === "side"
        ? "left"
        : rawType === "top"
          ? "front"
          : (g.type as keyof typeof typeCount);
    if (!(t in typeCount)) continue;

    // 多主图场景下：
    // 1) 只保留“主选中的那张主图”（main 类型最多 1 张）
    // 2) 各辅助视角各最多 1 张，避免多张图把模型的注意力挤没
    if (t === "main" && fb && u !== fb) continue;
    if (t === "main" && typeCount.main >= 1) continue;
    if (t === "on_model" && typeCount.on_model >= 1) continue;
    if (t === "left" && typeCount.left >= 1) continue;
    if (t === "right" && typeCount.right >= 1) continue;
    if (t === "rear" && typeCount.rear >= 1) continue;
    if (t === "front" && typeCount.front >= 1) continue;

    seen.add(u);
    if (t in typeCount) typeCount[t] += 1;
    urls.push(u);
    if (urls.length >= 3) break;
  }
  if (fb && !seen.has(fb)) {
    seen.add(fb);
    urls.unshift(fb);
  }
  // 尽量把主图/佩戴图/多角度图给到（若可用），提高“基于图片生成”的准确性
  return urls.slice(0, 3);
}

export const runtime = "nodejs";

function ruleBasedCopywriting(prompt: string): Copywriting {
  return {
    title: buildTitle(prompt),
    tags: pickTagsFromPrompt(prompt),
    description: buildDescription(prompt),
  };
}

function pickTagsFromPrompt(prompt: string): string[] {
  const raw = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const candidates = Array.from(
    new Set([
      "sterling silver",
      "ring",
      "statement ring",
      "gothic",
      "boho",
      "nature",
      "owl",
      "purple",
      "teardrop stone",
      "animal",
      "vintage",
      "gift",
      "handmade",
      ...raw.slice(0, 20),
    ])
  );

  const tags: string[] = [];
  for (const c of candidates) {
    const t = c
      .trim()
      .replace(/\s+/g, " ")
      .replace(/^-+|-+$/g, "");
    if (!t) continue;
    if (tags.includes(t)) continue;
    if (t.length > 20) continue;
    tags.push(t);
    if (tags.length >= 13) break;
  }

  while (tags.length < 13) tags.push(`gothic boho ring ${tags.length + 1}`.slice(0, 20));
  return tags.slice(0, 13);
}

function buildTitle(prompt: string): string {
  const p = prompt.trim();
  if (!p) return "Handmade Gothic Boho Owl Statement Ring with Purple Teardrop Gemstone";
  const short = p.length > 50 ? p.slice(0, 50).trim() + "..." : p;
  return `Handmade ${short} - Gothic Boho Statement Ring`;
}

function buildDescription(prompt: string): string {
  const p = prompt.trim();
  return `A one-of-a-kind statement piece inspired by your design vision.

This sterling silver ring features a ${p ? "crafted look inspired by: " + p : "detailed studio design"} style with an eye-catching centerpiece and an elegant, wearable silhouette.

Perfect for Etsy buyers who love gothic boho aesthetics, nature-themed jewelry, and unique gifts for birthdays, anniversaries, or special celebrations.

Add it to your collection today and enjoy a timeless, artsy look that photographs beautifully on every angle.`;
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function normalizeTagsFromLlm(tags: unknown): string[] {
  const arr = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [];
  const finalTags: string[] = [];
  for (const t of arr) {
    const tt = String(t).trim();
    if (!tt) continue;
    if (tt.length > 20) continue;
    if (finalTags.includes(tt)) continue;
    finalTags.push(tt);
    if (finalTags.length >= 13) break;
  }
  while (finalTags.length < 13) {
    finalTags.push(`gothic boho ring ${finalTags.length + 1}`.slice(0, 20));
  }
  return finalTags.slice(0, 13);
}

export async function POST(req: Request) {
  const authz = await requireApiActiveUser();
  if (!authz.ok) return authz.response;

  let prompt = "";
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    prompt = typeof body.prompt === "string" ? body.prompt : "";
    const galleryImages = (body.galleryImages ?? []) as GalleryImage[];
    const selectedMainImageUrl =
      typeof body.selectedMainImageUrl === "string" ? body.selectedMainImageUrl : "";

    if (!prompt.trim()) {
      return NextResponse.json({ message: "缺少 prompt" }, { status: 400 });
    }

    const imageUrls = collectVisionImageUrls(galleryImages, selectedMainImageUrl);
    const types = Array.from(new Set(galleryImages.map((x) => x.type)));
    const debugImageCount = imageUrls.length;

    const system = [
      "你是资深 Etsy 珠宝类目 Listing 文案与 SEO 专家。用户会提供「产品设计/卖点」文字（可能含中文），并可能附带 1–3 张珠宝产品图（主图/佩戴/左视/右视/后视/正视等）。",
      "",
      "【强制以图为准】如果提供了图片：",
      "1) 你必须从图片中提取可见要素：主体造型（动物/符号等）、主石颜色/大致切割形状（若可见）、金属色泽/表面做旧与抛光对比、戒臂/吊坠外形（宽/窄、纹理/雕刻）等；",
      "2) 文字 prompt 只能作为“参考背景”，不允许它覆盖图片中可见事实；",
      "3) 如果图片里看不清某个细节：就用通用但合理的表达，不要编造；",
      "Title、Tags、Description 必须与图片可见内容一致；若图文冲突，以图片为准。",
      "",
      "【输出格式】只输出严格 JSON，无 markdown、无代码块、无多余文字。字段：title:string, tags:string[13], description:string。",
      "",
      "【Title — Etsy SEO 风格（对标优质珠宝 listing）】",
      "- 全英文；总长度建议不超过 Etsy 标题上限约 140 字符。",
      "- 用逗号分隔 2–4 个「关键词短语」，像真实爆款标题：材质/主石/造型 + 款式（wide band/statement 等）+ 风格（boho/gothic 等）+ 礼物场景（Gift for her 等）。",
      "- 示例风格（勿照抄）：Sterling Silver Owl Ring with Purple Teardrop Stone, Wide Band Statement Bird Ring, Boho Forest Jewelry Gift",
      "- 必须结合图片与文字中的真实元素（动物、植物、石头颜色、银、工艺词等），不要写与可见款式无关的物种或宝石。",
      "",
      "【Tags — 恰好 13 个】",
      "- 全小写英文短语；每个 tag ≤20 字符；无 # 号；与 title/description 关键词呼应（材质、主题、风格、场景词）。",
      "- 示例风格（勿照抄）：sterling silver ring, owl ring, owl jewelry, purple stone ring, animal ring, boho ring…",
      "",
      "【Description — 长文案 + 分段 SEO 结构】",
      "全文英文，段落清晰，适合 Etsy 买家扫读。必须按下面顺序组织（标题行全大写加粗效果用文字行表示即可，用换行分段）：",
      "1) 开头 1–2 段：情感钩子 + 产品一句话定位（nature/magic/meaningful jewelry 等，贴合用户输入）。",
      "2) 一段：工艺与视觉细节（雕刻、纹理、宽戒臂、做旧与抛光对比等，基于用户描述合理展开，勿编造具体毫米尺寸）。",
      "3) 单独一行标题：FEATURES —— 下一行起用 • 开头的项目符号列表（5–8 条），每条一句，突出材质、主石镶嵌、戒型、表面处理等。",
      "4) 单独一行标题：MATERIALS & STYLE —— • 列表，Metal/Stone/Finish/Style 等，宝石可写颜色与切割，若用户未说「天然」勿声称 natural。",
      "5) 单独一行标题：SYMBOLISM —— 一小段，解释主题寓意（如猫头鹰与智慧、保护等），与产品主题一致；若无强符号主题可写简短「meaningful gift」类表述。",
      "6) 单独一行标题：PERFECT FOR —— • 列表，送礼/穿搭场景（boho、witchy、gothic、日常等）。",
      "7) 单独一行标题：CARE —— 一小段，925 银保养常识。",
      "8) 文末增加 2–3 句「店铺说明」英文：定制周期约 15–20 天请耐心等待；图片仅供参考以实物为准；手工可能存在约 10% 细微差异；非质量问题不接受退换；下单即表示知悉。语气礼貌专业（可参考 Etsy 常见免责声明，勿用中文）。",
      "",
      "【禁忌】不写医疗功效；不编造精确克拉/证书；用户未提供的材质不要擅自改成金/铂；保持与输入一致。",
    ].join("\n");

    const user = [
      "商品设计输入（参考背景，非可见事实）：",
      prompt,
      "",
      `附带产品图数量：${imageUrls.length}。请以图片提取到的可见要素为准。`,
      `图类型标签（内部参考，正文勿提）：${types.join(", ") || (imageUrls.length ? "main" : "none")}`,
    ].join("\n");

    // 按你的要求：Step4 只调用该模型（两段式：先提取图中要素，再生成最终文案）
    const usedModel = "qwen3.5-flash-2026-02-23";

    // 1) 先让模型“只做识图提取”（严格 JSON，减少一次性写完整文案时的漂移/猜测）
    const extractSystem = [
      "你是电商珠宝视觉分析助手。",
      "输入包含 1–3 张图片（可能是主图/佩戴图/多角度展示图）以及用户的设计提示词。",
      "你的任务：只根据图片可见信息提取可用于 Etsy listing 的要素；不要编造看不清的细节。",
      "输出必须是严格 JSON，只输出 JSON，不要输出任何额外文字。",
      "",
      "JSON 字段（必须全部包含）：",
      "{",
      "  category: 'ring'|'pendant'|'unknown',",
      "  main_motif: string,",
      "  gemstone_color: string,",
      "  gemstone_shape: string,",
      "  metal: string,",
      "  finish: string,",
      "  band_width: 'wide'|'medium'|'unknown',",
      "  style_keywords: string[],",
      "  contains_bail: boolean",
      "}",
      "",
      "规则：",
      "- 图片看不清就用 'unknown'；style_keywords 不确定就填 []。",
      "- 用户提示词只能用于风格参考，不允许覆盖图片事实。",
      "- 如果你无法判断，则尽量选择更安全的 'unknown'，不要硬猜。",
    ].join("\n");

    const extractUser = [
      "用户设计提示词（仅风格参考，不作为事实来源）：",
      prompt,
      "",
      `附带产品图数量：${imageUrls.length}`,
      "请开始只做图片要素提取。",
    ].join("\n");

    const extractRes = await laoZhangChatCompletionSingleModel({
      model: usedModel,
      system: extractSystem,
      user: extractUser,
      imageUrls,
      temperature: 0.2,
      maxTokens: 600,
    });

    const extractedJson = extractRes?.content
      ? extractJsonObject(String(extractRes.content))
      : null;
    const extracted =
      extractedJson && typeof extractedJson === "object"
        ? (extractedJson as Record<string, unknown>)
        : null;

    if (!extracted) {
      return NextResponse.json({
        ...ruleBasedCopywriting(prompt),
        debug_used_model: usedModel,
        debug_image_count: debugImageCount,
      });
    }

    // 2) 基于提取结果生成最终 listing（严格 JSON：title/tags/description）
    // 重要：第二段不再让模型重新识图，避免把图片再次看一遍导致“猜测/跑偏”。
    const finalSystem = [
      system,
      "",
      "【本轮事实来源】请仅以用户输入中的“提取结果”为事实来源，不要再基于图片新增/修改产品要素（即使你在上下文中看到了图片也不要覆盖提取结果）。",
    ].join("\n");
    const finalUser = [
      "你已经完成了识图要素提取。",
      "现在请基于“提取结果”生成最终 Etsy listing（严格 JSON 输出）。",
      "",
      "提取结果（作为事实来源）：",
      JSON.stringify(extracted),
      "",
      "用户提示词（仅用于补充语气/风格，不允许覆盖图片事实）：",
      prompt,
      "",
      `附带产品图数量：${imageUrls.length}`,
      `图类型标签（仅内部参考，不要写入正文）：${types.join(", ") || "none"}`,
      "",
      "参考背景（原 Step4 输入文本，非事实来源）：",
      user,
    ].join("\n");

    const finalRes = await laoZhangChatCompletionSingleModel({
      model: usedModel,
      system: finalSystem,
      user: finalUser,
      // 第二段不再传图片：由提取结果驱动最终文案生成
      temperature: 0.6,
      maxTokens: 1200,
    });

    if (!finalRes?.content) {
      return NextResponse.json({
        ...ruleBasedCopywriting(prompt),
        debug_used_model: usedModel,
        debug_image_count: debugImageCount,
      });
    }

    const parsed = extractJsonObject(String(finalRes.content));
    if (!parsed || typeof parsed !== "object" || parsed === null) {
      return NextResponse.json({
        ...ruleBasedCopywriting(prompt),
        debug_used_model: usedModel,
        debug_image_count: debugImageCount,
      });
    }

    const p = parsed as Record<string, unknown>;
    const titleRaw = typeof p.title === "string" ? p.title.trim() : "";
    const descriptionRaw =
      typeof p.description === "string" ? p.description.trim() : "";
    const finalTags = normalizeTagsFromLlm(p.tags);

    const title = titleRaw || buildTitle(prompt);
    const description = descriptionRaw || buildDescription(prompt);

    const copywriting: Copywriting = {
      title,
      tags: finalTags,
      description,
    };

    return NextResponse.json({
      ...copywriting,
      debug_used_model: usedModel,
      debug_image_count: debugImageCount,
    });
  } catch {
    return NextResponse.json({
      ...ruleBasedCopywriting(prompt),
      debug_used_model: null,
      debug_image_count: null,
    });
  }
}
