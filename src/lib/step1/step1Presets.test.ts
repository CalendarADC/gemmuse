import { describe, expect, it } from "vitest";

import {
  buildDicePrompt,
  findElementPoolSearchMatches,
  formatElementPool,
  mergeImportedStep1Presets,
  normalizeElementPoolToken,
  normalizeStep1Preset,
  parseElementPoolInput,
  parseStep1PresetsImportJson,
  serializeStep1PresetsExport,
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

describe("normalizeStep1Preset", () => {
  it("migrates legacy single material field", () => {
    const preset = normalizeStep1Preset({
      id: "p0",
      name: "legacy",
      elements: ["鸟"],
      styleIds: ["gothic"],
      designObject: "ring",
      material: "brass",
      diceStrength: "single_element_single_style",
      createdAt: "",
      updatedAt: "",
    });
    expect(preset?.materials).toEqual(["brass"]);
  });
});

const samplePreset = (): Step1Preset => ({
  id: "p1",
  name: "test",
  elements: ["鸟"],
  styleIds: ["gothic"],
  designObject: "ring",
  materials: ["s925"],
  diceStrength: "single_element_single_style",
  createdAt: "",
  updatedAt: "",
});

describe("findElementPoolSearchMatches", () => {
  it("finds spans for elements containing query", () => {
    const raw = "卢恩符文+渡鸦羽翼,小鸟,卢恩符文+狼首";
    const elements = parseElementPoolInput(raw);
    const matches = findElementPoolSearchMatches(raw, elements, "卢恩符文");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(raw.slice(matches[0]!.start, matches[0]!.end)).toContain("卢恩符文");
  });

  it("falls back to substring when no element contains query", () => {
    const raw = "abc,def";
    const elements = parseElementPoolInput(raw);
    const matches = findElementPoolSearchMatches(raw, elements, "c,d");
    expect(matches).toEqual([{ start: 2, end: 5 }]);
  });
});

describe("step1 presets import/export", () => {
  it("round-trips export json", () => {
    const preset = samplePreset();
    const json = serializeStep1PresetsExport([preset]);
    const imported = parseStep1PresetsImportJson(json);
    expect(imported).toHaveLength(1);
    expect(imported[0]?.name).toBe("test");
  });

  it("merges import and reassigns conflicting ids", () => {
    const existing = samplePreset();
    const incoming = [{ ...existing, name: "copy" }];
    const merged = mergeImportedStep1Presets([existing], incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).not.toBe(existing.id);
    expect(merged[1]?.id).toBe(existing.id);
  });
});

describe("buildDicePrompt", () => {
  it("uses compound element as single theme token", () => {
    const preset: Step1Preset = {
      ...samplePreset(),
      elements: ["天使翅+天体+卢恩符文"],
    };
    const prompt = buildDicePrompt(preset);
    expect(prompt).toContain("以天使翅+天体+卢恩符文作为设计主题");
    expect(prompt).not.toMatch(/以天使翅和天体/);
  });
});
