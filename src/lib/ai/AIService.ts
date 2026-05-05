export type AspectRatio =
  | "1:1"
  | "16:9"
  | "9:16"
  | "4:3"
  | "3:4"
  | "21:9"
  | "3:2"
  | "2:3"
  | "5:4"
  | "4:5";

export type ImageSize = "1K" | "2K" | "4K";

export type LaoZhangSampling = {
  temperature?: number;
  /** Gemini uses topP (camelCase) in generationConfig */
  topP?: number;
};

type LaoZhangGenerateResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        inlineData?: {
          data?: string;
        };
        inline_data?: {
          data?: string;
        };
        text?: string;
      }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

const LAOZHANG_IMAGE_API_ORIGIN = "https://api.laozhang.ai";
const LAOZHANG_OPENAI_BASE = "https://api.laozhang.ai/v1";

/** Step1 可选：Pro 与 Flash（老张路径 segment 与 Google 模型名一致） */
export const LAOZHANG_IMAGE_MODEL_PRO = "gemini-3-pro-image-preview" as const;
export const LAOZHANG_IMAGE_MODEL_FLASH = "gemini-3.1-flash-image-preview" as const;
export const LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2 = "gpt-image-2" as const;
export type LaoZhangImageModelId =
  | typeof LAOZHANG_IMAGE_MODEL_PRO
  | typeof LAOZHANG_IMAGE_MODEL_FLASH
  | typeof LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2;

export function laoZhangImageGenerateUrl(modelId: LaoZhangImageModelId): string {
  if (modelId === LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2) {
    return `${LAOZHANG_OPENAI_BASE}/chat/completions`;
  }
  return `${LAOZHANG_IMAGE_API_ORIGIN}/v1beta/models/${modelId}:generateContent`;
}

/** 429/502/503 时指数退避；饱和类错误略加长等待，总时长可能到数分钟 */
const LAOZHANG_IMAGE_MAX_ATTEMPTS = (() => {
  const raw = process.env.LAOZHANG_IMAGE_MAX_ATTEMPTS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  // 官方最小透传默认：单次直连，不做客户端重试；仅在显式配置时才开启重试。
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 1;
})();
const LAOZHANG_RETRY_BASE_MS = 3_500;
/** 单次上游生图请求最大等待时长（避免 fetch 无限挂起） */
const LAOZHANG_HTTP_TIMEOUT_MS = 300_000;
/** 拉取外部参考图转 base64 的超时 */
const IMAGE_FETCH_TIMEOUT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  return /aborted|timed out|timeout/i.test(error.message);
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const LAOZHANG_429_HINT =
  "建议：隔几分钟再试；可关闭「极速」、Step3 少选视角分批生成，减轻瞬时并发。";

function parseLaoZhangErrorDetail(status: number, bodyText: string): string {
  const trimmed = bodyText.trim();
  try {
    const j = JSON.parse(trimmed) as {
      error?: { message?: string; localized_message?: string };
    };
    const msg = j?.error?.message?.trim();
    if (msg) {
      if (status === 429 && !msg.includes("建议")) return `${msg}（${LAOZHANG_429_HINT}）`;
      return msg;
    }
    const loc = j?.error?.localized_message?.trim();
    if (loc && loc !== "Unknown error") {
      if (status === 429 && !loc.includes("建议")) return `${loc}（${LAOZHANG_429_HINT}）`;
      return loc;
    }
  } catch {
    /* 非 JSON */
  }
  if (status === 429) {
    return `上游繁忙或限流（429）。${LAOZHANG_429_HINT}若持续出现请联系老张客服或升级套餐。`;
  }
  if (status === 503 || status === 502) {
    return "上游暂时不可用（502/503），请稍后重试。";
  }
  return trimmed ? trimmed.slice(0, 800) : "(无响应正文)";
}

function extractImageBase64FromGenerateResponse(json: LaoZhangGenerateResponse): string | null {
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
  for (const c of candidates) {
    const parts = Array.isArray(c?.content?.parts) ? c.content.parts : [];
    for (const p of parts) {
      const b64a = p?.inlineData?.data?.trim();
      if (b64a) return b64a;
      const b64b = p?.inline_data?.data?.trim();
      if (b64b) return b64b;
      const t = p?.text?.trim();
      if (t && t.startsWith("data:image/")) {
        const m = /^data:[^;]+;base64,(.*)$/.exec(t);
        if (m?.[1]) return m[1];
      }
    }
  }
  return null;
}

function buildNoImageDetail(json: LaoZhangGenerateResponse): string {
  const reasons: string[] = [];
  const blockReason = json?.promptFeedback?.blockReason;
  if (blockReason) reasons.push(`blockReason=${blockReason}`);
  const finishReasons = (json?.candidates ?? [])
    .map((c) => c?.finishReason)
    .filter((x): x is string => !!x);
  if (finishReasons.length) reasons.push(`finishReason=${finishReasons.join(",")}`);
  return reasons.length ? `（${reasons.join("；")}）` : "";
}

function hasNoImageFinishReason(json: LaoZhangGenerateResponse): boolean {
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
  return candidates.some((c) => (c?.finishReason || "").toUpperCase() === "NO_IMAGE");
}

function extractFirstImageUrlFromMarkdown(text: string): string | null {
  const m = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i.exec(text);
  return m?.[1] ?? null;
}

async function postLaoZhangOpenAiImageByChat(
  payload: object,
  operation: "generate" | "edit",
  laozhangApiKey?: string
): Promise<string> {
  const apiKey = requireLaoZhangApiKey(laozhangApiKey);
  const prefix = operation === "generate" ? "gpt-image-2 图像生成失败" : "gpt-image-2 图像编辑失败";
  const url = `${LAOZHANG_OPENAI_BASE}/chat/completions`;
  let lastStatus = 0;
  let lastBody = "";
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
        LAOZHANG_HTTP_TIMEOUT_MS
      );
      lastNetworkError = null;
    } catch (error) {
      lastNetworkError = error;
      const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;
      if (hasMoreAttempts) {
        const waitMs = Math.min(90_000, LAOZHANG_RETRY_BASE_MS * Math.pow(2, attempt));
        await sleep(waitMs);
        continue;
      }
      const detail =
        error instanceof Error
          ? isAbortLikeError(error)
            ? "上游接口响应超时（网络拥堵或服务繁忙）"
            : error.message
          : "请求上游接口失败";
      throw new Error(`${prefix}：${detail}`);
    }

    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json?.choices?.[0]?.message?.content ?? "";
      const imageUrl = typeof content === "string" ? extractFirstImageUrlFromMarkdown(content) : null;
      if (!imageUrl) {
        throw new Error("gpt-image-2 返回中未找到图片 URL。");
      }
      const image = await fetchImageToBase64(imageUrl);
      return image.base64;
    }

    lastStatus = res.status;
    lastBody = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status === 503 || res.status === 502;
    const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;
    if (!retryable || !hasMoreAttempts) {
      const detail = parseLaoZhangErrorDetail(res.status, lastBody);
      throw new Error(`${prefix}（HTTP ${res.status}）：${detail}`);
    }
    let waitMs = Math.min(180_000, LAOZHANG_RETRY_BASE_MS * Math.pow(2, attempt));
    const ra = res.headers.get("retry-after");
    if (ra) {
      const sec = Number.parseInt(ra, 10);
      if (!Number.isNaN(sec) && sec > 0) waitMs = Math.min(180_000, sec * 1000);
    }
    const jitter = 0.85 + Math.random() * 0.3;
    await sleep(Math.floor(waitMs * jitter));
  }

  if (lastNetworkError) {
    const detail =
      lastNetworkError instanceof Error
        ? isAbortLikeError(lastNetworkError)
          ? "上游接口响应超时（网络拥堵或服务繁忙）"
          : lastNetworkError.message
        : "请求上游接口失败";
    throw new Error(`${prefix}：${detail}`);
  }
  const detail = parseLaoZhangErrorDetail(lastStatus, lastBody);
  throw new Error(`${prefix}（HTTP ${lastStatus}）：${detail}`);
}

/**
 * 调用老张图像 generateContent，对 429/502/503 做指数退避重试。
 */
async function postLaoZhangImageGenerate(
  payload: object,
  operation: "generate" | "edit",
  modelId: LaoZhangImageModelId = LAOZHANG_IMAGE_MODEL_PRO,
  laozhangApiKey?: string
): Promise<string> {
  const apiKey = requireLaoZhangApiKey(laozhangApiKey);
  const prefix = operation === "generate" ? "老张图像生成失败" : "老张图像编辑失败";
  const url = laoZhangImageGenerateUrl(modelId);

  let lastStatus = 0;
  let lastBody = "";
  let didSamplingFallback = false;
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
        LAOZHANG_HTTP_TIMEOUT_MS
      );
      lastNetworkError = null;
    } catch (error) {
      lastNetworkError = error;
      const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;
      if (hasMoreAttempts) {
        const waitMs = Math.min(90_000, LAOZHANG_RETRY_BASE_MS * Math.pow(2, attempt));
        await sleep(waitMs);
        continue;
      }
      const detail =
        error instanceof Error
          ? isAbortLikeError(error)
            ? "上游接口响应超时（网络拥堵或服务繁忙）"
            : error.message
          : "请求上游接口失败";
      throw new Error(`${prefix}：${detail}`);
    }

    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as LaoZhangGenerateResponse;
      const base64 = extractImageBase64FromGenerateResponse(json);
      if (!base64) {
        const noImage = hasNoImageFinishReason(json);
        const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;
        if (noImage && hasMoreAttempts) {
          const waitMs = Math.min(25_000, 2_000 + attempt * 1_500);
          await sleep(waitMs);
          continue;
        }
        throw new Error(`老张返回结果中未找到图片 base64 数据${buildNoImageDetail(json)}。`);
      }
      return base64;
    }

    lastStatus = res.status;
    lastBody = await res.text().catch(() => "");

    const retryable = res.status === 429 || res.status === 503 || res.status === 502;
    const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;

    // 若 generationConfig 不支持 temperature/topP（可能是 schema 不允许），做一次“去采样字段”回退。
    const payloadAny = payload as any;
    const hasSampling =
      !!payloadAny?.generationConfig &&
      (payloadAny.generationConfig.temperature !== undefined ||
        payloadAny.generationConfig.topP !== undefined ||
        payloadAny.generationConfig.top_p !== undefined);

    if (
      !retryable &&
      hasSampling &&
      !didSamplingFallback &&
      (res.status === 400 || res.status === 422)
    ) {
      const bodyLower = lastBody.toLowerCase();
      const looksLikeSamplingInvalid =
        bodyLower.includes("temperature") || bodyLower.includes("topp") || bodyLower.includes("top_p");

      if (looksLikeSamplingInvalid) {
        didSamplingFallback = true;
        const strippedPayload = JSON.parse(JSON.stringify(payload)) as any;
        if (strippedPayload?.generationConfig) {
          delete strippedPayload.generationConfig.temperature;
          delete strippedPayload.generationConfig.topP;
          delete strippedPayload.generationConfig.top_p;
        }
        let res2: Response;
        try {
          res2 = await fetchWithTimeout(
            url,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(strippedPayload),
            },
            LAOZHANG_HTTP_TIMEOUT_MS
          );
        } catch (error) {
          const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;
          if (hasMoreAttempts) {
            const waitMs = Math.min(90_000, LAOZHANG_RETRY_BASE_MS * Math.pow(2, attempt));
            await sleep(waitMs);
            continue;
          }
          const detail =
            error instanceof Error
              ? isAbortLikeError(error)
                ? "上游接口响应超时（网络拥堵或服务繁忙）"
                : error.message
              : "请求上游接口失败";
          throw new Error(`${prefix}：${detail}`);
        }
        if (res2.ok) {
          const json2 = (await res2.json().catch(() => ({}))) as LaoZhangGenerateResponse;
          const base64_2 = extractImageBase64FromGenerateResponse(json2);
          if (!base64_2) {
            const noImage2 = hasNoImageFinishReason(json2);
            if (noImage2) {
              // 回退请求若命中 NO_IMAGE，不立即终止，回到外层循环继续重试。
              const waitMs = Math.min(25_000, 2_500 + attempt * 1_500);
              await sleep(waitMs);
              continue;
            }
            throw new Error(`老张返回结果中未找到图片 base64 数据${buildNoImageDetail(json2)}。`);
          }
          return base64_2;
        }
        // fallback 失败则继续按原逻辑抛出错误
      }
    }

    if (!retryable || !hasMoreAttempts) {
      const detail = parseLaoZhangErrorDetail(res.status, lastBody);
      throw new Error(`${prefix}（HTTP ${res.status}）：${detail}`);
    }

    let waitMs = Math.min(180_000, LAOZHANG_RETRY_BASE_MS * Math.pow(2, attempt));
    const ra = res.headers.get("retry-after");
    if (ra) {
      const sec = parseInt(ra, 10);
      if (!Number.isNaN(sec) && sec > 0) {
        waitMs = Math.min(180_000, sec * 1000);
      }
    }
    // 上游明确报「负载饱和」时多等一会，提高重试成功率
    if (res.status === 429) {
      const b = lastBody.toLowerCase();
      if (
        lastBody.includes("饱和") ||
        lastBody.includes("负载") ||
        b.includes("capacity") ||
        b.includes("overload")
      ) {
        waitMs = Math.min(180_000, Math.floor(waitMs * 1.85));
      }
    }
    // 增加少量随机抖动，避免所有请求同一时刻“踩点”重试
    const jitter = 0.85 + Math.random() * 0.3;
    await sleep(Math.floor(waitMs * jitter));
  }

  if (lastNetworkError) {
    const detail =
      lastNetworkError instanceof Error
        ? isAbortLikeError(lastNetworkError)
          ? "上游接口响应超时（网络拥堵或服务繁忙）"
          : lastNetworkError.message
        : "请求上游接口失败";
    throw new Error(`${prefix}：${detail}`);
  }
  const detail = parseLaoZhangErrorDetail(lastStatus, lastBody);
  throw new Error(`${prefix}（HTTP ${lastStatus}）：${detail}`);
}

function requireLaoZhangApiKey(overrideKey?: string): string {
  const key = overrideKey?.trim() || process.env.LAOZHANG_API_KEY;
  if (!key) {
    throw new Error(
      "缺少环境变量 LAOZHANG_API_KEY。请在项目根目录创建 .env.local 并填写你的老张 API Key（格式通常为 sk-xxxxx）。"
    );
  }
  return key;
}

function dataUrlToBase64(dataUrl: string): { mimeType: string; base64: string } {
  // data:image/png;base64,AAAA
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) {
    // 兜底：当它不是 data URL 时，调用方应该已经做了 fetch -> base64
    return { mimeType: "image/png", base64: dataUrl };
  }
  return { mimeType: m[1], base64: m[2] };
}

async function fetchImageToBase64(url: string): Promise<{ mimeType: string; base64: string }> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {}, IMAGE_FETCH_TIMEOUT_MS);
  } catch (error) {
    const detail =
      error instanceof Error
        ? isAbortLikeError(error)
          ? "拉取参考图超时"
          : error.message
        : "拉取参考图失败";
    throw new Error(`无法拉取图片进行转换（${detail}）`);
  }
  if (!res.ok) {
    throw new Error(`无法拉取图片进行转换（HTTP ${res.status}）`);
  }
  const contentType = res.headers.get("content-type") || "image/png";
  const ab = await res.arrayBuffer();
  const base64 = Buffer.from(ab).toString("base64");
  return { mimeType: contentType, base64 };
}

export async function laoZhangTextToImage(args: {
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  sampling?: LaoZhangSampling;
  laoZhangImageModel?: LaoZhangImageModelId;
  laozhangApiKey?: string;
}): Promise<string> {
  const modelId = args.laoZhangImageModel ?? LAOZHANG_IMAGE_MODEL_PRO;
  if (modelId === LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2) {
    return postLaoZhangOpenAiImageByChat(
      {
        model: LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2,
        messages: [{ role: "user", content: args.prompt }],
        stream: false,
      },
      "generate",
      args.laozhangApiKey
    );
  }
  const payload = {
    contents: [{ parts: [{ text: args.prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: args.aspectRatio,
        imageSize: args.imageSize,
      },
      ...(args.sampling
        ? {
            temperature: args.sampling.temperature,
            topP: args.sampling.topP,
          }
        : {}),
    },
  };

  return postLaoZhangImageGenerate(payload, "generate", modelId, args.laozhangApiKey);
}

async function resolveInlineImagePart(
  initImageDataUrl: string
): Promise<{ inline_data: { mime_type: string; data: string } }> {
  if (initImageDataUrl.startsWith("data:")) {
    const { mimeType, base64 } = dataUrlToBase64(initImageDataUrl);
    return {
      inline_data: {
        mime_type: mimeType,
        data: base64,
      },
    };
  }

  const r = await fetchImageToBase64(initImageDataUrl);
  return {
    inline_data: {
      mime_type: r.mimeType,
      data: r.base64,
    },
  };
}

/** 多参考图图生图：prompt + 多张 inline 图按顺序传给 Gemini */
export async function laoZhangImagesToImage(args: {
  initImageDataUrls: string[];
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  sampling?: LaoZhangSampling;
  laoZhangImageModel?: LaoZhangImageModelId;
  /** Gemini 图改图时可选：把参考图放在 prompt 前，提高源图约束优先级 */
  promptAfterImages?: boolean;
  laozhangApiKey?: string;
}): Promise<string> {
  const modelId = args.laoZhangImageModel ?? LAOZHANG_IMAGE_MODEL_PRO;
  if (!args.initImageDataUrls.length) {
    throw new Error("laoZhangImagesToImage: 至少需要一张参考图");
  }
  if (modelId === LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2) {
    return postLaoZhangOpenAiImageByChat(
      {
        model: LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: args.prompt },
              ...args.initImageDataUrls.map((url) => ({
                type: "image_url",
                image_url: { url },
              })),
            ],
          },
        ],
        stream: false,
      },
      "edit",
      args.laozhangApiKey
    );
  }

  const imageParts: Array<{ inline_data: { mime_type: string; data: string } }> = [];
  for (const url of args.initImageDataUrls) {
    imageParts.push(await resolveInlineImagePart(url));
  }

  const parts: Array<
    { text: string } | { inline_data: { mime_type: string; data: string } }
  > = args.promptAfterImages ? [...imageParts, { text: args.prompt }] : [{ text: args.prompt }, ...imageParts];

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: args.aspectRatio,
        imageSize: args.imageSize,
      },
      ...(args.sampling
        ? {
            temperature: args.sampling.temperature,
            topP: args.sampling.topP,
          }
        : {}),
    },
  };

  return postLaoZhangImageGenerate(payload, "edit", modelId, args.laozhangApiKey);
}

export async function laoZhangImageToImage(args: {
  initImageDataUrl: string; // data:image/...;base64,...
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  sampling?: LaoZhangSampling;
  laoZhangImageModel?: LaoZhangImageModelId;
  promptAfterImages?: boolean;
  laozhangApiKey?: string;
}): Promise<string> {
  return laoZhangImagesToImage({
    initImageDataUrls: [args.initImageDataUrl],
    prompt: args.prompt,
    aspectRatio: args.aspectRatio,
    imageSize: args.imageSize,
    sampling: args.sampling,
    laoZhangImageModel: args.laoZhangImageModel,
    promptAfterImages: args.promptAfterImages,
    laozhangApiKey: args.laozhangApiKey,
  });
}

export function toDataPng(base64: string) {
  return `data:image/png;base64,${base64}`;
}
