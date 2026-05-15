import type { JewelryProductKind } from "@/lib/ai/jewelrySoftLimits";

type ExpandArgs = {
  prompt: string;
  kind: JewelryProductKind;
};

type ExpandResult = {
  expandedPrompt: string;
  model: string;
};

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

function requireStep1ExpandApiKey(): string {
  const k = process.env.STEP1_EXPAND_API_KEY?.trim();
  if (!k) {
    const isDesktop = process.env.DESKTOP_LOCAL_IMAGE_STORAGE === "1";
    if (isDesktop) {
      throw new Error(
        "缺少 STEP1_EXPAND_API_KEY。桌面版请在 exe 安装目录或用户数据目录新建 .env.local 并填写 STEP1_EXPAND_API_KEY=你的API密钥，然后重启软件。"
      );
    }
    throw new Error(
      "缺少 STEP1_EXPAND_API_KEY。请在 .env.local 配置用于 Step1 强创意改写的新 API Key。"
    );
  }
  return k;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 上游 5xx / 429 / 连接池满等，短退避后重试常能成功 */
function shouldRetryStep1ExpandHttp(status: number, detail: string): boolean {
  if (status === 429 || status === 502 || status === 503) return true;
  if (status === 500) {
    const d = detail.toLowerCase();
    if (
      d.includes("too many connections") ||
      d.includes("1040") ||
      d.includes("timeout") ||
      d.includes("overloaded") ||
      d.includes("temporarily unavailable")
    ) {
      return true;
    }
    return true;
  }
  return false;
}

function parseExpandErrorDetail(text: string): string {
  let detail = text;
  try {
    const j = JSON.parse(text) as OpenAiChatResponse;
    detail = j?.error?.message || detail;
  } catch {
    // non-json
  }
  return detail;
}

/**
 * 供 generate-main 等在回退提示中区分「上游过载」与「配置问题」。
 */
export function step1ExpandFailureUserHint(detail: string): string {
  const d = detail.toLowerCase();
  if (d.includes("1040") || d.includes("too many connections")) {
    return "当前多为上游服务暂时过载（数据库连接数已满等），通常与本地 STEP1_EXPAND_API_KEY 无关，请隔几秒再试；若长期出现需联系接口提供方扩容。";
  }
  if (d.includes("缺少 step1_expand") || d.includes("step1_expand_api_key")) {
    return "请在 .env.local 中配置 STEP1_EXPAND_API_KEY（及按需配置 STEP1_EXPAND_MODEL / STEP1_EXPAND_BASE_URL）。";
  }
  if (d.includes("401") || d.includes("unauthorized") || d.includes("invalid api key")) {
    return "请检查 STEP1_EXPAND_API_KEY 是否有效、是否过期。";
  }
  return "若持续失败，请检查 STEP1_EXPAND_API_KEY / STEP1_EXPAND_MODEL / STEP1_EXPAND_BASE_URL，或稍后重试。";
}

export async function expandStep1PromptWithAi(args: ExpandArgs): Promise<ExpandResult> {
  const apiKey = requireStep1ExpandApiKey();
  const baseUrl = (
    process.env.STEP1_EXPAND_BASE_URL || "https://ark.cn-beijing.volces.com/api/coding/v3"
  ).replace(/\/+$/, "");
  const model = process.env.STEP1_EXPAND_MODEL || "ark-code-latest";

  const system = [
    "You are a senior jewelry concept prompt expander for Chinese-speaking users.",
    "",
    "LANGUAGE (HARD): The entire expanded output MUST be written in Simplified Chinese (简体中文).",
    "Do not write the expanded prompt primarily in English. You may keep short unavoidable tokens (e.g. 925, AU750, 4K, brand codes) inline where natural.",
    "",
    "Task: 将用户输入改写为一段可直接用于 AI 生图的、精炼的简体中文提示词（电商主图级清晰度）。",
    "保持用户原始主题与意图不变；不要擅自更换品类（戒指/吊坠等以用户与品类推断为准）。",
    "补充珠宝专业表达：材质、工艺、可生产性、镶嵌逻辑、轮廓与光影，但避免空洞堆砌。",
    "",
    "HARD OUTPUT RULE — SINGLE HERO PRODUCT ONLY:",
    "扩写正文必须只描述「一件」实体珠宝、「一张」主图画面；禁止一图多件、排戒展示、对比组图、系列陈列等。",
    "若用户列举多种动物或元素：视为同一枚首饰的设计灵感来源，或择一主元素统一呈现，不得要求画面出现多枚戒指/多件主体。",
    "戒指可佩戴性：戒圈与手指接触区域下方禁止向下凸出的尖刺、爪钩、悬挂结构等硌手造型，内侧尽量平顺可戴。",
    "",
    "OUTPUT FORMAT: 只输出最终扩写后的中文提示词纯文本；禁止 JSON、Markdown、解释性前后缀。",
  ].join("\n");

  const user = [
    `品类（推断）: ${args.kind}`,
    "用户原始提示:",
    args.prompt.trim(),
  ].join("\n");

  const payload = {
    model,
    temperature: 0.85,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  const url = `${baseUrl}/chat/completions`;
  const maxAttempts = 3;
  const backoffMs = [0, 900, 2200];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(backoffMs[attempt]!);
    }

    let res: Response;
    let text: string;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      text = await res.text().catch(() => "");
    } catch (netErr) {
      const msg = netErr instanceof Error ? netErr.message : String(netErr);
      if (attempt === maxAttempts - 1) {
        throw new Error(`Step1 AI 改写失败（网络）：${msg}`);
      }
      continue;
    }

    if (res.ok) {
      let content = "";
      try {
        const data = JSON.parse(text) as OpenAiChatResponse;
        content = data?.choices?.[0]?.message?.content?.trim() || "";
      } catch {
        content = text.trim();
      }
      if (!content) throw new Error("Step1 AI 改写返回为空。");
      return { expandedPrompt: content, model };
    }

    const detail = parseExpandErrorDetail(text);
    const retry =
      attempt < maxAttempts - 1 && shouldRetryStep1ExpandHttp(res.status, detail);
    if (!retry) {
      throw new Error(`Step1 AI 改写失败（HTTP ${res.status}）：${detail || "unknown error"}`);
    }
  }

  throw new Error("Step1 AI 改写失败：重试次数已用尽。");
}
