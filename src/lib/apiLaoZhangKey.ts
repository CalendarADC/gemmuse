const LAOZHANG_KEY_HEADER = "x-laozhang-api-key";

export function resolveRequestLaoZhangApiKey(req: Request): string {
  const key = req.headers.get(LAOZHANG_KEY_HEADER)?.trim() ?? "";
  return key;
}

export function requireRequestLaoZhangApiKey(req: Request): string {
  const key = resolveRequestLaoZhangApiKey(req);
  if (!key) {
    throw new Error("缺少老张 API Key：请先在 Step1 顶部填写 API 密钥。");
  }
  return key;
}

