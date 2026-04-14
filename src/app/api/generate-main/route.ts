import { NextResponse } from "next/server";

import {
  LAOZHANG_IMAGE_MODEL_FLASH,
  LAOZHANG_IMAGE_MODEL_PRO,
  laoZhangImagesToImage,
  laoZhangTextToImage,
  type ImageSize,
  type LaoZhangImageModelId,
} from "@/lib/ai/AIService";
import {
  expandStep1PromptWithAi,
  step1ExpandFailureUserHint,
} from "@/lib/ai/step1PromptAiExpander";
import {
  appendKeywordBoosters,
  buildNanoBananaPromptExpansion,
  buildMainImageCompositionBlock,
  buildMaterialLightingBlock,
  buildPendantPhysicalBlock,
  buildReferenceFusionBlock,
  buildRingPhysicalBlock,
  buildNanoBananaProStep1SystemPrompt,
  buildStep1BatchMotifDiversityPreamble,
  buildStep1PerImageMotifVariantLine,
  buildDelicateRingMotifScaleIntegrationBlock,
  buildGlobalNegativePromptBlock,
  buildSingleJewelryPieceOnlyConstraintBlock,
  inferJewelryProductKind,
  type PromptExpansionStrength,
  userExplicitEnvironmentOrSurfaceInPrompt,
} from "@/lib/ai/jewelrySoftLimits";
import { requireApiActiveUser } from "@/lib/apiAuth";
import { persistGeneratedImage } from "@/lib/images/persistGeneratedImage";
import { ensureOwnedTaskId } from "@/lib/tasks/resolveTask";

export const runtime = "nodejs";

type Body = {
  taskId?: string;
  prompt: string;
  count: number;
  provider: string;
  /** true = 极速（2K）；false = 高清（4K） */
  fastMode?: boolean;
  /** Step1 扩写强度：standard（默认）| strong（更强创意补充） */
  expansionStrength?: PromptExpansionStrength;
  /** Step1 参考图（data URL），最多 3 张；有则图生图，无则文生图 */
  referenceImageDataUrls?: string[] | null;
  /** @deprecated 兼容旧客户端单张字段 */
  referenceImageDataUrl?: string | null;
  /** Step1：老张 Banana pro（Pro）或 Banana 2（Flash） */
  bananaImageModel?: "banana-pro" | "banana-2";
  /** @deprecated 请改用 bananaImageModel */
  step1ImageModel?: "banana-pro" | "banana-2";
};

const MAX_REFERENCE_DATA_URL_CHARS = 14 * 1024 * 1024;

function isValidReferenceDataUrl(v: string): boolean {
  if (!v.startsWith("data:image/")) return false;
  if (v.length > MAX_REFERENCE_DATA_URL_CHARS) return false;
  return /;base64,/.test(v);
}

export async function POST(req: Request) {
  const authz = await requireApiActiveUser();
  if (!authz.ok) return authz.response;

  const body = (await req.json().catch(() => ({}))) as Partial<Body>;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const taskIdRaw = typeof body.taskId === "string" ? body.taskId : "";
  const countRaw = typeof body.count === "number" ? body.count : 2;
  const count = Math.min(5, Math.max(1, Math.floor(countRaw)));
  const provider = typeof body.provider === "string" ? body.provider : "nano-banana-pro";
  const fastMode = !!body.fastMode;
  const expansionStrength: PromptExpansionStrength =
    body.expansionStrength === "strong" ? "strong" : "standard";
  const fromArray = Array.isArray(body.referenceImageDataUrls)
    ? body.referenceImageDataUrls
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter((s) => isValidReferenceDataUrl(s))
        .slice(0, 3)
    : [];

  const legacySingle =
    typeof body.referenceImageDataUrl === "string" &&
    body.referenceImageDataUrl.trim() &&
    isValidReferenceDataUrl(body.referenceImageDataUrl.trim())
      ? [body.referenceImageDataUrl.trim()]
      : [];

  const referenceImageDataUrls =
    fromArray.length > 0 ? fromArray : legacySingle.length > 0 ? legacySingle : [];

  const bananaRaw =
    typeof body.bananaImageModel === "string"
      ? body.bananaImageModel.trim()
      : typeof body.step1ImageModel === "string"
        ? body.step1ImageModel.trim()
        : "";
  const laoZhangImageModel: LaoZhangImageModelId =
    bananaRaw === "banana-2" ? LAOZHANG_IMAGE_MODEL_FLASH : LAOZHANG_IMAGE_MODEL_PRO;

  if (!prompt.trim()) {
    return NextResponse.json({ message: "缺少 prompt" }, { status: 400 });
  }
  const taskId = await ensureOwnedTaskId(authz.user.id, taskIdRaw);
  if (!taskId) {
    return NextResponse.json({ message: "无效 taskId" }, { status: 400 });
  }

  // nano-banana-pro 软限制：在老张图像生成的采样参数中给定合理随机性/严谨性
  const sampling =
    provider === "nano-banana-pro" ? { temperature: 1, topP: 0.85 } : undefined;

  const now = new Date().toISOString();

  const promptLower = prompt.toLowerCase();
  const isSterling925 = /(925|sterling silver|sterling)/.test(promptLower);
  const kind = inferJewelryProductKind(prompt);
  const productType = kind;
  const productTypeCn = productType === "pendant" ? "带 bail 的吊坠" : "一枚戒指";

  // 1:1 更适合 Etsy 主图；图片尺寸先用 2K（更快，后续你想上 4K 我再帮你加选项）
  const aspectRatio = "1:1" as const;
  const imageSize: ImageSize = fastMode ? "2K" : "4K";

  try {
    const images = [];
    let aiExpandWarning: string | null = null;
    const isStandardMode = expansionStrength === "standard";
    const userEnvSurface = userExplicitEnvironmentOrSurfaceInPrompt(prompt);
    const etsyBackgroundLine3 = userEnvSurface
      ? "3) 背景与台面（优先遵守用户原文）：若 prompt 指定木质/橡木/深色老橡木桌面、木纹深浅与走向、石材/织物台面、自然光/微距等，必须按描述生成，禁止擅自改成无纹理的纯色灰/白无缝棚拍。木纹需清晰可辨；若用户要求戒指曲线与木纹走向呼应，构图需体现这种关系。"
      : "3) 纯净背景：纯色工作室背景（plain solid studio background），颜色以用户 prompt 指定为准（若 prompt 提到黑底/深色，则用黑/深色；否则可用白底）。";
    const ringInnerBandStrictBlock = isStandardMode
      ? "5.0) RING INNER BAND（内圈）必须完整连续、光滑平整，仅保留正常手指通孔；严禁额外孔洞、镂空、贯穿槽、口袋状凹陷或断裂边。"
      : [
          "5.0) RING INNER BAND ZERO-DEFECT（最高优先级）: 内圈内壁必须为完整、连续、平滑的封闭曲面；仅允许正常手指通孔，禁止任何额外孔洞/穿孔/槽口/镂空窗口。",
          "5.1) INNER BAND（内圈/贴近手指的那一圈）必须是“完整连续的实心内壁”：除了正常的手指通孔外，严禁任何额外孔洞、镂空、穿孔、贯穿槽或窗口结构。",
          "5.2) INNER BAND（内圈/内侧）必须光滑平整：不要有凹陷坑、内凹槽、塌陷、口袋状凹位或断裂边。",
          "5.3) INNER BAND（内圈/内侧）不要有任何雕刻/纹样图案；保持纯净无装饰雕花。",
          "5.4) 若生成结果出现内圈凹陷或额外孔洞，视为失败样式，必须改为完整平滑内壁后再输出。",
        ].join("\n");
    const etsyMainConstraints = [
      "Etsy 主图拍摄约束（必须严格遵守）：",
      ...(isStandardMode
        ? []
        : [
            `1) 画面仅允许一件首饰成品（硬性）：整图只能有${productTypeCn === "带 bail 的吊坠" ? "一只吊坠主体" : "一枚戒指"}；禁止同一画面内多枚戒指并排/横排、多件首饰同台、三联或多联陈列、一张图里多款 SKU；禁止「多款戒指横排/并列在台面或皮革上」类构图；不要出现额外耳环/手链/第二枚戒指等第二件首饰。`,
          ]),
      "2) 不要出现任何人物/手部/身体部位（no model, no hands）。",
      etsyBackgroundLine3,
      "4) 不要生成任何文字、logo、水印、品牌名、贴纸、边框或额外图形。",
      ...(isStandardMode
        ? []
        : [
            "4.1) 单帧单图：整张输出必须是「一幅」连续主图照片，禁止宫格、分镜、拼图、多面板、2x2/多格小窗、故事板、联画等「一张图里多套构图」；禁止在同一画面内并排展示多款变体。",
          ]),
      productType === "pendant"
        ? "5) 产品居中、清晰对焦，展示吊坠外形与主石细节，同时必须清晰可见 bail/挂环/连接处（用于挂链/项链）。但画面中只展示吊坠本体和 bail，不要出现任何链条/链段（NO necklace chain）。无链时 bail 须受重力自然垂落或靠扶于头顶/造型顶部，禁止像被隐形项链拉紧那样刚性悬空竖立。保持金属质感与做旧/抛光对比。"
      : ["5) 产品居中、清晰对焦；拍摄角度须为电商主图常用「直立戒圈 / 主饰面朝前」的展示（高级目录照：戒圈立在台面上，主雕与主石正面可读），禁止侧躺仅见戒圈厚度、强侧视、沿戒臂低角度掠过以致主饰面不可读的构图；展示戒臂与主石细节；保持金属质感与做旧/抛光对比。", ringInnerBandStrictBlock].join(
          "\n"
        ),
    // 宝石数量/密集度约束：避免密集小碎石、宝石种类/颜色过多
    "6) 宝石数量与外观限制（必须遵守）：每件首饰的宝石种类不超过 2 种。",
    "6.1) 单个戒指/吊坠上的宝石颜色不超过 2 种（如果出现两种主色，则不要再添加第三种颜色的宝石）。",
    "6.2) 不要出现大量密集的小宝石/碎钻铺满式装饰；优先使用“少量大颗/主石 + 少量补充点缀”的构图。",
    ...(isSterling925
      ? [
          "7) 925/sterling silver 的宝石必须是“纯净单色/单一色相”：禁止渐变（no gradient）、禁止褪色过渡（no fading）、禁止多色层次（no multi-tone）。",
          "7.1) 宝石内部不得出现杂质/斑点/颜色不均/闪斑/杂色小片；整体观感必须是纯净均匀的同色宝石（no impurities, no speckles）。",
        ]
      : []),
      `${isSterling925 ? "8" : "7"}) 光线：自然工作室灯光，真实反射、不过曝、不过度磨皮。`,
    ].join("\n");

    const refCount = referenceImageDataUrls.length;
    const promptOriginal = prompt.trim();
    const keywordBoosters = appendKeywordBoosters(prompt);
    let semanticExpansion = buildNanoBananaPromptExpansion(prompt, expansionStrength);
    let expansionSource: "rules" | "ai" | "ai_fallback_rules" = "rules";
    let expansionModel: string | null = null;
    if (expansionStrength === "strong") {
      try {
        const ai = await expandStep1PromptWithAi({ prompt, kind });
        semanticExpansion = ai.expandedPrompt;
        expansionSource = "ai";
        expansionModel = ai.model;
      } catch (e) {
        // 强创意模式下，若外部 AI 改写失败，自动回退到规则扩写，确保不阻塞生图。
        semanticExpansion = buildNanoBananaPromptExpansion(prompt, "standard");
        expansionSource = "ai_fallback_rules";
        const detail = e instanceof Error ? e.message : "unknown";
        aiExpandWarning = `强创意（AI）扩写失败，已自动回退为规则扩写。${step1ExpandFailureUserHint(detail)} 详情：${detail}`;
      }
    }
    const basePromptWithBoosters = promptOriginal + keywordBoosters;
    /** 强创意时 LLM/规则扩写都可能加重「多款动物=多款戒指」歧义，紧跟扩写后再钉死单件 */
    const postAiExpandSinglePieceLock =
      expansionStrength === "strong"
        ? [
            "【强创意模式 — 单图单件（覆盖上文扩写歧义）】",
            "上文扩写只服务于「一件」成品首饰的一张主图；禁止理解为同一画面多枚戒指/多只吊坠、横排多款或三联陈列。",
            "若扩写与「仅一件」冲突，以本段为准。",
            buildSingleJewelryPieceOnlyConstraintBlock(),
          ].join("\n\n")
        : "";
    const boostedPrompt = [basePromptWithBoosters, semanticExpansion, postAiExpandSinglePieceLock]
      .filter(Boolean)
      .join("\n\n");
    const referencePreamble = buildReferenceFusionBlock(refCount, prompt);
    const systemPrompt = buildNanoBananaProStep1SystemPrompt(prompt);

    const productionSoftLimits = [
      kind === "ring"
        ? buildRingPhysicalBlock("main", false)
        : buildPendantPhysicalBlock(false),
      buildMaterialLightingBlock(promptLower, isSterling925),
      buildMainImageCompositionBlock(kind, prompt),
      kind === "ring" ? buildDelicateRingMotifScaleIntegrationBlock(prompt) : "",
      buildGlobalNegativePromptBlock(prompt),
    ]
      .filter(Boolean)
      .join("\n\n");

    const batchDiversity = buildStep1BatchMotifDiversityPreamble(count, prompt);
    const userFacingExpandedPromptCommon = [
      "【Nano Banana Pro 可复刻扩写提示词】",
      "以下内容仅包含可直接复用的设计提示，不含系统协议/软限制/负面规则。",
      aiExpandWarning ? `【提示】${aiExpandWarning}` : "",
      "",
      "【基础提示词】",
      basePromptWithBoosters,
      "",
      "【AI/扩写提示词】",
      semanticExpansion || "(无扩写)",
      "",
      `【扩写强度】${expansionStrength === "strong" ? "强创意（AI优化）" : "标准（规则扩写）"}`,
      `【扩写来源】${
        expansionSource === "ai"
          ? `AI 改写${expansionModel ? `（${expansionModel}）` : ""}`
          : expansionSource === "ai_fallback_rules"
            ? "AI 失败已回退规则扩写"
            : "规则扩写"
      }`,
      "",
      refCount > 0
        ? `【参考图融合】已启用 ${refCount} 张参考图（结构尽量贴近参考图，风格与材质以文字提示词为准）`
        : "【参考图融合】未启用参考图（纯文生图）",
    ].join("\n");
    const finalPromptCommon =
      refCount > 0
        ? `${referencePreamble}\n\n${systemPrompt}\n\n${boostedPrompt}\n\n${etsyMainConstraints}\n\n${productionSoftLimits}${
            batchDiversity ? `\n\n${batchDiversity}` : ""
          }`
        : `${systemPrompt}\n\n${boostedPrompt}\n\n${etsyMainConstraints}\n\n${productionSoftLimits}${
            batchDiversity ? `\n\n${batchDiversity}` : ""
          }`;

    const jobs = Array.from({ length: count }, (_, i) => i).map(async (i) => {
      const variantLine = buildStep1PerImageMotifVariantLine(i, count, prompt);
      const promptForThis = variantLine ? `${finalPromptCommon}\n\n${variantLine}` : finalPromptCommon;

      const base64 =
        refCount > 0
          ? await laoZhangImagesToImage({
              initImageDataUrls: referenceImageDataUrls,
              prompt: promptForThis,
              aspectRatio,
              imageSize,
              sampling,
              laoZhangImageModel,
            })
          : await laoZhangTextToImage({
              prompt: promptForThis,
              aspectRatio,
              imageSize,
              sampling,
              laoZhangImageModel,
            });

      const userFacingExpandedPromptForThis = [
        userFacingExpandedPromptCommon,
        variantLine ? `\n【本张变体指令】\n${variantLine}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const persisted = await persistGeneratedImage({
        userId: authz.user.id,
        taskId,
        kind: "main",
        base64,
        debugPromptZh: userFacingExpandedPromptForThis,
        keyPrefix: `users/${authz.user.id}/step1`,
      });

      return {
        id: persisted.id,
        url: persisted.url,
        createdAt: now,
        // 前端“眼睛”按钮：只显示可复刻扩写提示词（不含系统/软限制）
        debugPromptZh: userFacingExpandedPromptForThis,
      };
    });
    const generated = await Promise.all(jobs);
    images.push(...generated);

    // 由于 Step1 中 systemPrompt/软限制拼装较长，这里直接返回最终用于生成的 prompt（中文呈现优先）
    // 前端用于「眼睛」按钮查看；每张图另有 images[].debugPromptZh（含当张轮换后缀）。
    return NextResponse.json({
      images,
      debugPromptZh: userFacingExpandedPromptCommon,
      ...(aiExpandWarning ? { warning: aiExpandWarning } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成失败";
    return NextResponse.json({ message }, { status: 500 });
  }
}

