import { describe, expect, it, vi } from "vitest";

import { WEB_LOCAL_MODE_HEADER } from "@/lib/runtime/desktopLocalMode";

vi.mock("@/lib/ai/step1PromptAiExpander", () => ({
  expandStep1PromptWithAi: vi.fn().mockResolvedValue({
    expandedPrompt: "expanded test prompt",
    model: "gpt-test",
  }),
}));

describe("POST /api/step1-expand", () => {
  it("allows web-local client without login session", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/step1-expand", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [WEB_LOCAL_MODE_HEADER]: "1",
        },
        body: JSON.stringify({ prompt: "test ring" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { expandedPrompt?: string };
    expect(data.expandedPrompt).toBe("expanded test prompt");
  });
});
