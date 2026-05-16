import { describe, expect, it } from "vitest";

import {
  buildDicePrompt,
  formatElementPool,
  normalizeElementPoolToken,
  parseElementPoolInput,
  type Step1Preset,
} from "./step1Presets";

describe("parseElementPoolInput", () => {
  it("treats plus-connected parts as one element", () => {
    expect(parseElementPoolInput("天使翅+天体+卢恩符文")).toEqual(["天使翅+天体+卢恩符文"]);
  });

  it("treats fullwidth plus and spaces around plus as one element", () => {
    expect(parseElementPoolInput("天使翅 ＋ 天体 + 卢恩符文")).toEqual(["天使翅＋天体+卢恩符文"]);
  });

  it("splits on comma but keeps plus groups", () => {
    expect(parseElementPoolInput("天使翅+天体+卢恩符文,小鸟,小鸡+小鸭")).toEqual([
      "天使翅+天体+卢恩符文",
      "小鸟",
      "小鸡+小鸭",
    ]);
  });

  it("supports Chinese comma between pool items", () => {
    expect(parseElementPoolInput("向日葵，月亮+星星")).toEqual(["向日葵", "月亮+星星"]);
  });
});

describe("formatElementPool", () => {
  it("round-trips compound elements", () => {
    const elements = ["天使翅+天体+卢恩符文", "小鸟"];
    expect(parseElementPoolInput(formatElementPool(elements))).toEqual(elements);
  });
});

describe("normalizeElementPoolToken", () => {
  it("trims and collapses spaces around plus", () => {
    expect(normalizeElementPoolToken("  a + b  ")).toBe("a+b");
  });
});

describe("buildDicePrompt", () => {
  it("uses compound element as single theme token", () => {
    const preset: Step1Preset = {
      id: "p1",
      name: "test",
      elements: ["天使翅+天体+卢恩符文"],
      styleIds: ["gothic"],
      designObject: "ring",
      material: "s925",
      diceStrength: "single_element_single_style",
      createdAt: "",
      updatedAt: "",
    };
    const prompt = buildDicePrompt(preset);
    expect(prompt).toContain("以天使翅+天体+卢恩符文作为设计主题");
    expect(prompt).not.toMatch(/以天使翅和天体/);
  });
});
