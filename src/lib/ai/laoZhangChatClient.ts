/**
 * 老张 API - Chat Completions（OpenAI 兼容，支持多模态 vision）
 * 文档：https://docs.laozhang.ai/api-capabilities/text-generation
 */

const CHAT_URL = "https://api.laozhang.ai/v1/chat/completions";

const MAX_VISION_IMAGES = 3;
const REQUEST_TIMEOUT_MS = 35000;
const MAX_TOKENS = 1800;

export function getLaoZhangApiKey(): string | null {
  const k = process.env.LAOZHANG_API_KEY?.trim();
  return k || null;
}

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: { content?: string };
    text?: string;
  }>;
};

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

const DEFAULT_TEXT_MODELS = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "deepseek-chat",
  "gpt-4o-mini",
  "gpt-4o",
  "qwen-turbo",
];

/** 带图时优先尝试（需模型支持 vision；失败会自动试下一个） */
const DEFAULT_VISION_MODELS = [
  "gpt-4o",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "deepseek-chat",
  "qwen-turbo",
];

function isAllowedImageUrl(url: string): boolean {
  const u = url.trim();
  if (u.startsWith("data:image/")) return true;
  if (u.startsWith("https://") || u.startsWith("http://")) return true;
  return false;
}

function sanitizeImageUrls(urls: string[] | undefined): string[] {
  if (!urls?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    if (!isAllowedImageUrl(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u.trim());
    if (out.length >= MAX_VISION_IMAGES) break;
  }
  return out;
}

function buildUserMessagePayload(userText: string, imageUrls: string[]) {
  const images = sanitizeImageUrls(imageUrls);
  if (!images.length) {
    return { role: "user" as const, content: userText };
  }
  const parts: ContentPart[] = [{ type: "text", text: userText }];
  for (const url of images) {
    parts.push({ type: "image_url", image_url: { url } });
  }
  return { role: "user" as const, content: parts };
}

function uniqueModels(list: (string | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of list) {
    const t = m?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * @param imageUrls 产品图 data URL 或 https；最多取前 MAX_VISION_IMAGES 张
 */
export async function laoZhangChatCompletionBestEffort(args: {
  system: string;
  user: string;
  imageUrls?: string[];
  temperature?: number;
}): Promise<{ content: string; model: string } | null> {
  const apiKey = getLaoZhangApiKey();
  if (!apiKey) return null;

  const images = sanitizeImageUrls(args.imageUrls);
  const hasVision = images.length > 0;

  const single = process.env.LAOZHANG_TEXT_MODEL?.trim();
  const visionExtra = process.env.LAOZHANG_VISION_MODEL?.trim();

  let models: string[];
  if (hasVision) {
    models = uniqueModels([
      visionExtra,
      single,
      ...DEFAULT_VISION_MODELS,
      ...DEFAULT_TEXT_MODELS,
    ]);
  } else {
    models = single ? [single] : DEFAULT_TEXT_MODELS;
  }

  const userMsg = buildUserMessagePayload(args.user, images);

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: args.temperature ?? 0.6,
          max_tokens: MAX_TOKENS,
          messages: [{ role: "system", content: args.system }, userMsg],
        }),
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        const msg = errJson?.error?.message || `HTTP ${res.status}`;
        if (res.status === 401) return null;
        if (res.status === 503 || /无可用渠道|无可用|channel/i.test(msg)) {
          continue;
        }
        // 多模态不被当前模型支持时常见 400：换下一个模型
        if (
          hasVision &&
          (res.status === 400 ||
            /image|vision|multimodal|不支持|not support|invalid/i.test(msg))
        ) {
          continue;
        }
        continue;
      }

      const json = (await res.json().catch(() => null)) as ChatCompletionsResponse | null;
      const content =
        json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? null;
      if (content) return { content: String(content), model };
    } catch {
      continue;
    }
  }

  // 有图但全部失败：最后再试纯文本（避免完全无结果）
  if (hasVision) {
    for (const model of single ? [single] : DEFAULT_TEXT_MODELS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            temperature: args.temperature ?? 0.6,
            max_tokens: MAX_TOKENS,
            messages: [
              { role: "system", content: args.system },
              { role: "user", content: args.user },
            ],
          }),
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const json = (await res.json().catch(() => null)) as ChatCompletionsResponse | null;
        const content =
          json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? null;
        if (content) return { content: String(content), model };
      } catch {
        continue;
      }
    }
  }

  return null;
}

export async function laoZhangChatCompletionSingleModel(args: {
  model: string;
  system: string;
  user: string;
  imageUrls?: string[];
  temperature?: number;
  maxTokens?: number;
}): Promise<{ content: string; model: string } | null> {
  const apiKey = getLaoZhangApiKey();
  if (!apiKey) return null;

  const images = sanitizeImageUrls(args.imageUrls);
  const userMsg = buildUserMessagePayload(args.user, images);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: args.model,
        temperature: args.temperature ?? 0.6,
        max_tokens: typeof args.maxTokens === "number" ? args.maxTokens : MAX_TOKENS,
        messages: [{ role: "system", content: args.system }, userMsg],
      }),
    });

    clearTimeout(timer);

    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as ChatCompletionsResponse | null;
    const content =
      json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? null;
    if (!content) return null;
    return { content: String(content), model: args.model };
  } catch {
    return null;
  }
}
