const LAOZHANG_KEY_HEADER = "x-laozhang-api-key";

export function resolveRequestLaoZhangApiKey(req: Request): string {
  const key = req.headers.get(LAOZHANG_KEY_HEADER)?.trim() ?? "";
  return key;
}

/**
 * 优先从 JSON body 取密钥（桌面内嵌 Next 时自定义头偶发不可达），再读请求头。
 */
export function resolveLaoZhangApiKeyFromRequest(req: Request, bodyValue: unknown): string | undefined {
  if (typeof bodyValue === "string" && bodyValue.trim()) return bodyValue.trim();
  const h = resolveRequestLaoZhangApiKey(req);
  return h.trim() || undefined;
}

export function requireRequestLaoZhangApiKey(req: Request): string {
  const key = resolveRequestLaoZhangApiKey(req);
  if (!key) {
    throw new Error("缺少老张 API Key：请先在 Step1 顶部填写 API 密钥。");
  }
  return key;
}

