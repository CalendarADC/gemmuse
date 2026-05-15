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

type LaoZhangPart = {
  inlineData?: { data?: string; mimeType?: string; mime_type?: string };
  inline_data?: { data?: string; mime_type?: string };
  fileData?: { data?: string; mimeType?: string };
  file_data?: { data?: string; mime_type?: string };
  text?: string;
};

type LaoZhangGenerateResponse = {
  candidates?: Array<{
    finishReason?: string;
    finish_reason?: string;
    content?: {
      parts?: LaoZhangPart[];
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
    block_reason?: string;
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

export function resolveLaoZhangImageModelFromBanana(bananaRaw: string): LaoZhangImageModelId {
  const v = bananaRaw.trim();
  if (v === "banana-2") return LAOZHANG_IMAGE_MODEL_FLASH;
  if (v === "gpt-image-2") return LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2;
  return LAOZHANG_IMAGE_MODEL_PRO;
}

/** Step1/2 生图失败时追加给用户的简短说明（原始错误信息仍保留在 message 中） */
export function laoZhangImageFailureUserHint(detail: string): string {
  const d = detail.toLowerCase();
  if (d.includes("no_image") || d.includes("未找到图片 base64")) {
    return "上游本次未返回图片（NO_IMAGE），常见于高峰或 4K/强扩写。已自动重试仍失败时请：隔几分钟再试、改用 Banana 2、或先开「极速」生成 2K；若带参考图可暂时减少参考图张数。";
  }
  if (d.includes("429") || d.includes("饱和") || d.includes("限流")) {
    return "上游繁忙或限流，请稍后再试，或减少 Step1 同时生成张数。";
  }
  if (d.includes("缺少老张") || d.includes("api key")) {
    return "请在 Step1 顶部填写老张 API Key，或在 .env 中配置 LAOZHANG_API_KEY。";
  }
  return "若持续失败，请检查老张 API Key、套餐额度，或稍后重试。";
}

export function laoZhangImageGenerateUrl(modelId: LaoZhangImageModelId): string {
  if (modelId === LAOZHANG_IMAGE_MODEL_GPT_IMAGE_2) {
    return `${LAOZHANG_OPENAI_BASE}/chat/completions`;
  }
  return `${LAOZHANG_IMAGE_API_ORIGIN}/v1beta/models/${modelId}:generateContent`;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

/** 429/502/503 时指数退避；默认 1 次（不重试 HTTP），可用 LAOZHANG_IMAGE_MAX_ATTEMPTS 调大 */
const LAOZHANG_IMAGE_MAX_ATTEMPTS = readPositiveIntEnv("LAOZHANG_IMAGE_MAX_ATTEMPTS", 1);
/** finishReason=NO_IMAGE 时单独重试（与 HTTP 重试计数分离），默认 4 次 */
const LAOZHANG_NO_IMAGE_MAX_ATTEMPTS = readPositiveIntEnv("LAOZHANG_NO_IMAGE_MAX_ATTEMPTS", 4);
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

function base64FromLaoZhangPart(p: LaoZhangPart | undefined): string | null {
  if (!p) return null;
  const fromInline =
    p.inlineData?.data?.trim() ||
    p.inline_data?.data?.trim() ||
    p.fileData?.data?.trim() ||
    p.file_data?.data?.trim();
  if (fromInline) return fromInline;
  const t = p.text?.trim();
  if (!t) return null;
  if (t.startsWith("data:image/")) {
    const m = /^data:[^;]+;base64,([\s\S]*)$/.exec(t);
    if (m?.[1]) return m[1];
  }
  // 少数代理把整段 base64 放在 text 里（无 data URL 前缀）
  if (/^[A-Za-z0-9+/=\s]+$/.test(t) && t.replace(/\s/g, "").length > 256) {
    return t.replace(/\s/g, "");
  }
  return null;
}

function extractImageBase64FromGenerateResponse(json: LaoZhangGenerateResponse): string | null {
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
  for (const c of candidates) {
    const parts = Array.isArray(c?.content?.parts) ? c.content.parts : [];
    for (const p of parts) {
      const b64 = base64FromLaoZhangPart(p);
      if (b64) return b64;
    }
  }
  return null;
}

function clonePayloadWithoutSampling(payload: object): object {
  const cloned = JSON.parse(JSON.stringify(payload)) as {
    generationConfig?: Record<string, unknown>;
  };
  const gc = cloned.generationConfig;
  if (gc) {
    delete gc.temperature;
    delete gc.topP;
    delete gc.top_p;
  }
  return cloned;
}

function noImageRetryWaitMs(noImageAttempt: number): number {
  const jitter = 0.85 + Math.random() * 0.3;
  return Math.floor(Math.min(25_000, 2_000 + noImageAttempt * 1_500) * jitter);
}

function buildNoImageDetail(json: LaoZhangGenerateResponse): string {
  const reasons: string[] = [];
  const blockReason =
    json?.promptFeedback?.blockReason?.trim() || json?.promptFeedback?.block_reason?.trim();
  if (blockReason) reasons.push(`blockReason=${blockReason}`);
  const finishReasons = (json?.candidates ?? [])
    .map((c) => c?.finishReason?.trim() || c?.finish_reason?.trim())
    .filter((x): x is string => !!x);
  if (finishReasons.length) reasons.push(`finishReason=${finishReasons.join(",")}`);
  return reasons.length ? `（${reasons.join("；")}）` : "";
}

function hasNoImageFinishReason(json: LaoZhangGenerateResponse): boolean {
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
  return candidates.some((c) => {
    const r = (c?.finishReason || c?.finish_reason || "").toUpperCase();
    return r === "NO_IMAGE";
  });
}

function shouldRetryEmptyImageResponse(json: LaoZhangGenerateResponse): boolean {
  if (extractImageBase64FromGenerateResponse(json)) return false;
  if (hasNoImageFinishReason(json)) return true;
  // HTTP 200 但无任何 inline 图：按空结果重试（上游偶发只回文本 part）
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
  return candidates.length > 0;
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
 * 调用老张图像 generateContent：HTTP 429/502/503 与 LAOZHANG_IMAGE_MAX_ATTEMPTS 对齐；
 * 200 但无图（含 finishReason=NO_IMAGE）单独按 LAOZHANG_NO_IMAGE_MAX_ATTEMPTS 重试，与前者解耦。
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

  let lastEmptyJson: LaoZhangGenerateResponse | null = null;
  let sawHttpOkWithoutImage = false;

  for (let noImageAttempt = 0; noImageAttempt < LAOZHANG_NO_IMAGE_MAX_ATTEMPTS; noImageAttempt++) {
    let lastStatus = 0;
    let lastBody = "";
    let didSamplingFallback = false;
    let lastNetworkError: unknown = null;
    let bodyToSend: object =
      noImageAttempt > 0 ? clonePayloadWithoutSampling(payload) : payload;

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
            body: JSON.stringify(bodyToSend),
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
        if (base64) return base64;
        sawHttpOkWithoutImage = true;
        lastEmptyJson = json;
        const canNoImageRetry = noImageAttempt < LAOZHANG_NO_IMAGE_MAX_ATTEMPTS - 1;
        if (shouldRetryEmptyImageResponse(json) && canNoImageRetry) {
          await sleep(noImageRetryWaitMs(noImageAttempt));
          break;
        }
        throw new Error(`老张返回结果中未找到图片 base64 数据${buildNoImageDetail(json)}。`);
      }

      lastStatus = res.status;
      lastBody = await res.text().catch(() => "");

      const retryable = res.status === 429 || res.status === 503 || res.status === 502;
      const hasMoreAttempts = attempt < LAOZHANG_IMAGE_MAX_ATTEMPTS - 1;

      const payloadAny = bodyToSend as {
        generationConfig?: { temperature?: unknown; topP?: unknown; top_p?: unknown };
      };
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
          bodyToSend = clonePayloadWithoutSampling(payload);
          continue;
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
    if (!sawHttpOkWithoutImage && lastStatus !== 0) {
      const detail = parseLaoZhangErrorDetail(lastStatus, lastBody);
      throw new Error(`${prefix}（HTTP ${lastStatus}）：${detail}`);
    }
  }

  if (lastEmptyJson) {
    throw new Error(`老张返回结果中未找到图片 base64 数据${buildNoImageDetail(lastEmptyJson)}。`);
  }
  throw new Error(`${prefix}：未知错误（无响应）。`);
}

function requireLaoZhangApiKey(overrideKey?: string): string {
  const key = overrideKey?.trim() || process.env.LAOZHANG_API_KEY;
  if (!key) {
    throw new Error(
      "缺少老张 API Key：请在 Step1 顶部填写密钥（会随请求提交），或在安装目录 / 项目根目录的 .env 中配置 LAOZHANG_API_KEY（格式通常为 sk-…）。",
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

/** @internal vitest */
export function extractImageBase64FromGenerateResponseForTest(json: LaoZhangGenerateResponse) {
  return extractImageBase64FromGenerateResponse(json);
}

/** @internal vitest */
export function shouldRetryEmptyImageResponseForTest(json: LaoZhangGenerateResponse) {
  return shouldRetryEmptyImageResponse(json);
}
