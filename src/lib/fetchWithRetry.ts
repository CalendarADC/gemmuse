/**
 * 浏览器端任务/工作区拉取：网络抖动时自动重试，与 store 内友好错误提示配合。
 */
export type FetchWithRetryOptions = {
  /** 额外重试次数（不含首次），默认 2 */
  retries?: number;
  baseDelayMs?: number;
  /** 单次尝试超时（毫秒），使用 AbortSignal.timeout */
  timeoutMs?: number;
  signal?: AbortSignal;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  opts: FetchWithRetryOptions = {}
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 350;
  const timeoutMs = opts.timeoutMs;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const signal =
        timeoutMs !== undefined
          ? AbortSignal.timeout(timeoutMs)
          : opts.signal ?? init?.signal;
      const res = await fetch(input, { ...init, signal });
      if (res.ok || res.status === 401 || res.status === 403 || res.status === 404) {
        return res;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) {
      await sleep(baseDelayMs * Math.pow(2, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
