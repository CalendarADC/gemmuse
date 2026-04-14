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
  const baseUrl = (process.env.STEP1_EXPAND_BASE_URL || "https://api.modelverse.cn/v1").replace(
    /\/+$/,
    ""
  );
  const model = process.env.STEP1_EXPAND_MODEL || "gpt-5.4";

  const system = [
    "You are a senior jewelry concept prompt expander.",
    "Task: rewrite the user's prompt into one polished, production-oriented English prompt for image generation.",
    "Keep the original subject and intent unchanged. Do NOT change category.",
    "Enhance with jewelry-native language: materials, craftsmanship, manufacturability cues, setting logic, silhouette flow, and premium e-commerce render clarity.",
    "",
    "HARD OUTPUT RULE — SINGLE HERO PRODUCT ONLY:",
    "The expanded text must describe exactly ONE physical jewelry piece for ONE e-commerce hero photograph.",
    "NEVER describe or imply multiple rings/pendants in the same frame: no trio/row/lineup, no 'three rings on leather', no side-by-side variants, no collection spread, no comparison set, no 'each ring shows a different animal' in one shot.",
    "If the user lists several animals or motifs (slashes, commas, 'or', Chinese enumeration): interpret them as design inspiration for ONE unified piece OR pick ONE primary motif for this single render — do NOT instruct a multi-ring composition.",
    "WEARABILITY HARD RULE (ring): do NOT introduce downward protrusions under the ring underside / finger-contact zone (no bottom spikes, claws, hooks, hanging points, or obstructive ornaments that poke the hand). Keep underside smooth and wearable.",
    "Return only the final expanded English prompt as plain text (no JSON, no markdown, no explanations).",
  ].join("\n");

  const user = [
    `Category: ${args.kind}`,
    "User prompt:",
    args.prompt.trim(),
  ].join("\n");

  const payload = {
    model,
    temperature: 0.7,
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

