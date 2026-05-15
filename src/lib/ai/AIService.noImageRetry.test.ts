import { describe, expect, it } from "vitest";

import {
  extractImageBase64FromGenerateResponseForTest,
  shouldRetryEmptyImageResponseForTest,
} from "./AIService";

describe("LaoZhang NO_IMAGE response handling", () => {
  it("extracts inlineData and fileData", () => {
    const b64 = "aGVsbG8=";
    expect(
      extractImageBase64FromGenerateResponseForTest({
        candidates: [
          {
            content: { parts: [{ inlineData: { data: b64 } }] },
          },
        ],
      })
    ).toBe(b64);
    expect(
      extractImageBase64FromGenerateResponseForTest({
        candidates: [
          {
            content: { parts: [{ file_data: { data: b64 } }] },
          },
        ],
      })
    ).toBe(b64);
  });

  it("retries when finishReason is NO_IMAGE", () => {
    expect(
      shouldRetryEmptyImageResponseForTest({
        candidates: [{ finishReason: "NO_IMAGE", content: { parts: [] } }],
      })
    ).toBe(true);
  });

  it("does not retry when image is present", () => {
    expect(
      shouldRetryEmptyImageResponseForTest({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ inlineData: { data: "abc" } }] },
          },
        ],
      })
    ).toBe(false);
  });
});
