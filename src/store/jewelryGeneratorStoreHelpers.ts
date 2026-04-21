import type { Copywriting, GalleryImageSelector, GeneratorStatus, GeneratorTask } from "./jewelryGeneratorTypes";

/** 将浏览器/Node 的 fetch 连接失败转为可读中文提示 */
/** 从非 2xx 的 fetch 响应中解析 `message` 或原始片段，便于在 UI 展示真实原因。 */
export async function readHttpErrorMessage(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  const t = raw.trim();
  if (!t) return "";
  try {
    const j = JSON.parse(t) as { message?: unknown };
    if (typeof j.message === "string" && j.message.trim()) return j.message.trim();
  } catch {
    /* 非 JSON */
  }
  return t.length > 500 ? `${t.slice(0, 500)}…` : t;
}

export function friendlyFetchErrorMessage(e: unknown): string | undefined {
  if (!(e instanceof Error)) return undefined;
  const msg = e.message;
  if (
    msg === "fetch failed" ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
  ) {
    if (typeof window !== "undefined") {
      const h = window.location.hostname;
      if (h === "localhost" || h === "127.0.0.1") {
        return "无法连接服务器：请确认已在项目目录运行 npm run dev，并在浏览器打开与终端一致的本地地址（常见为 http://localhost:3000）后再试。";
      }
    }
    return "无法连接服务器：请检查本机网络、VPN/代理或广告拦截插件；若使用线上站点，请稍后重试或确认 Vercel 部署与域名可访问。（请求发往当前页面域名，不会使用你电脑上的 localhost。）";
  }
  return msg;
}

export function galleryImageSelectorKey(s: GalleryImageSelector): string {
  return [s.id, s.setId ?? "", s.sourceMainImageId, s.type, s.createdAt ?? ""].join("::");
}

export function clampCount(v: number) {
  if (!Number.isFinite(v)) return 1;
  return Math.min(5, Math.max(1, Math.floor(v)));
}

export function idleGeneratorStatus(): GeneratorStatus {
  return {
    step1Generating: false,
    step3Generating: false,
    step4Generating: false,
    step1GenerationStartedAt: null,
    step3GenerationStartedAt: null,
    step4GenerationStartedAt: null,
  };
}

export function withStep1Generating(s: GeneratorStatus, on: boolean): GeneratorStatus {
  return { ...s, step1Generating: on, step1GenerationStartedAt: on ? Date.now() : null };
}

export function withStep3Generating(s: GeneratorStatus, on: boolean): GeneratorStatus {
  return { ...s, step3Generating: on, step3GenerationStartedAt: on ? Date.now() : null };
}

export function withStep4Generating(s: GeneratorStatus, on: boolean): GeneratorStatus {
  return { ...s, step4Generating: on, step4GenerationStartedAt: on ? Date.now() : null };
}

export const emptyCopywriting: Copywriting = { title: "", tags: [], description: "" };

export function newTaskId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function seedGeneratorTask(name: string): GeneratorTask {
  const now = new Date().toISOString();
  return {
    id: newTaskId(),
    name,
    sortOrder: 0,
    currentStep: "STEP1",
    createdAt: now,
    updatedAt: now,
    searchLine: "",
    isProtected: false,
  };
}

export const initialSidebarTask = seedGeneratorTask("任务 1");
