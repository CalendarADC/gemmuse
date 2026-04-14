/**
 * Qwen / DashScope OpenAI-compatible Chat Completions（可选多模态）
 */

const DEFAULT_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MAX_VISION_IMAGES = 1;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_TOKENS = 1800;
const QWEN_TEXT_MODEL_ONLY = "qwen3.5-flash-2026-02-23";

export function getQwenConfig(): {
  apiKey: string;
  baseUrl: string;
  model: string;
} | null {
  const apiKey =
    process.env.QWEN_API_KEY?.trim() ||
    process.env.DASHSCOPE_API_KEY?.trim() ||
    "";
  if (!apiKey) return null;

  const baseUrl = (process.env.QWEN_API_BASE_URL?.trim() || DEFAULT_BASE).replace(
    /\/$/,
    ""
  );
  // 按你的要求：Step4 只使用指定模型，不考虑其他大模型
  const model = QWEN_TEXT_MODEL_ONLY;

  return { apiKey, baseUrl, model };
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

function sanitizeImageUrls(urls: string[] | undefined): string[] {
  if (!urls?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    const t = u.trim();
    if (!t.startsWith("data:image/") && !t.startsWith("http://") && !t.startsWith("https://"))
      continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_VISION_IMAGES) break;
  }
  return out;
}

export async function qwenChatCompletion(args: {
  system: string;
  user: string;
  imageUrls?: string[];
  temperature?: number;
}): Promise<string | null> {
  const cfg = getQwenConfig();
  if (!cfg) return null;

  const images = sanitizeImageUrls(args.imageUrls);
  let userContent: string | ContentPart[];
  if (images.length) {
    const parts: ContentPart[] = [{ type: "text", text: args.user }];
    for (const url of images) {
      parts.push({ type: "image_url", image_url: { url } });
    }
    userContent = parts;
  } else {
    userContent = args.user;
  }

  const url = `${cfg.baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: cfg.model,
      temperature: args.temperature ?? 0.6,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: userContent },
      ],
    }),
  });
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Qwen 文案请求失败（HTTP ${res.status}）${text ? `: ${text.slice(0, 500)}` : ""}`);
  }

  const json = (await res.json().catch(() => null)) as ChatCompletionsResponse | null;
  const content =
    json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? null;
  return content ? String(content) : null;
}
