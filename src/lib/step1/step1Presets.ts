import { styleLabelById } from "@/lib/step1/step1StyleOptions";

export type Step1DiceStrength =
  | "single_element_single_style"
  | "single_element_dual_style"
  | "dual_element_single_style"
  | "dual_element_dual_style";

export type Step1DesignObject = "pendant" | "ring";
export type Step1Material = "s925" | "brass" | "rose_gold";

export type Step1Preset = {
  id: string;
  name: string;
  elements: string[];
  styleIds: string[];
  designObject: Step1DesignObject;
  /** 材质池：骰子每次从中随机抽取一种 */
  materials: Step1Material[];
  diceStrength: Step1DiceStrength;
  createdAt: string;
  updatedAt: string;
};

export const STEP1_PRESETS_STORAGE_KEY = "jewelry-step1-presets-v1";
export const STEP1_ACTIVE_PRESET_STORAGE_KEY = "jewelry-step1-active-preset-v1";

export const DESIGN_OBJECT_OPTIONS: { id: Step1DesignObject; label: string }[] = [
  { id: "pendant", label: "吊坠/项链" },
  { id: "ring", label: "戒指" },
];

export const MATERIAL_OPTIONS: { id: Step1Material; label: string }[] = [
  { id: "s925", label: "S925银" },
  { id: "brass", label: "黄铜" },
  { id: "rose_gold", label: "玫瑰金" },
];

export const DICE_STRENGTH_OPTIONS: { id: Step1DiceStrength; label: string }[] = [
  { id: "single_element_single_style", label: "单元素单风格" },
  { id: "single_element_dual_style", label: "单元素双风格" },
  { id: "dual_element_single_style", label: "双元素单风格" },
  { id: "dual_element_dual_style", label: "双元素双风格" },
];

export function designObjectLabel(id: Step1DesignObject): string {
  return DESIGN_OBJECT_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export function materialLabel(id: Step1Material): string {
  return MATERIAL_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export function materialsLabel(ids: Step1Material[]): string {
  const unique = [...new Set(ids)];
  return unique.map(materialLabel).join("、") || "—";
}

const VALID_MATERIALS = new Set<Step1Material>(MATERIAL_OPTIONS.map((o) => o.id));

function parseMaterialsFromStored(raw: unknown): Step1Material[] {
  if (Array.isArray(raw)) {
    const ids = raw.filter((id): id is Step1Material => typeof id === "string" && VALID_MATERIALS.has(id as Step1Material));
    if (ids.length) return [...new Set(ids)];
  }
  if (typeof raw === "string" && VALID_MATERIALS.has(raw as Step1Material)) {
    return [raw as Step1Material];
  }
  return ["s925"];
}

/** 兼容旧版仅存 `material` 单字段的预设数据 */
export function normalizeStep1Preset(raw: unknown): Step1Preset | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  if (!Array.isArray(o.elements) || !Array.isArray(o.styleIds)) return null;
  if (o.designObject !== "pendant" && o.designObject !== "ring") return null;
  const diceStrength = o.diceStrength;
  if (
    diceStrength !== "single_element_single_style" &&
    diceStrength !== "single_element_dual_style" &&
    diceStrength !== "dual_element_single_style" &&
    diceStrength !== "dual_element_dual_style"
  ) {
    return null;
  }
  const materials =
    o.materials !== undefined ? parseMaterialsFromStored(o.materials) : parseMaterialsFromStored(o.material);
  return {
    id: o.id,
    name: o.name,
    elements: o.elements.filter((e): e is string => typeof e === "string"),
    styleIds: o.styleIds.filter((s): s is string => typeof s === "string"),
    designObject: o.designObject,
    materials,
    diceStrength,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

/** 元素池项之间的分隔符（不含 +，+ 用于同一元素内的组合子主题） */
const ELEMENT_POOL_DELIMITER = /[,，]/;

/**
 * 解析元素池：仅用中英文逗号分格为多个元素。
 * 元素内部的 `+` / `＋`（可带空格）表示组合主题，仍计为 **一个** 元素，例如「天使翅+天体+卢恩符文」→ 1 项。
 */
export function parseElementPoolInput(raw: string): string[] {
  return raw
    .split(ELEMENT_POOL_DELIMITER)
    .map(normalizeElementPoolToken)
    .filter(Boolean);
}

/** 归一化单个元素：去首尾空白，压缩 + 两侧多余空格，便于存储与骰子调用 */
export function normalizeElementPoolToken(token: string): string {
  return token
    .trim()
    .replace(/\s*([+＋])\s*/g, "$1");
}

export function formatElementPool(elements: string[]): string {
  return elements.map(normalizeElementPoolToken).filter(Boolean).join(",");
}

export type ElementPoolTextSpan = { start: number; end: number };

/** 在元素池原文中查找所有匹配（优先完整元素名，否则按子串） */
export function findElementPoolSearchMatches(
  raw: string,
  elements: string[],
  query: string,
): ElementPoolTextSpan[] {
  const q = query.trim();
  if (!q || !raw) return [];

  const spans: ElementPoolTextSpan[] = [];
  const matchedElements = elements.filter((el) => el.includes(q));
  if (matchedElements.length > 0) {
    const seen = new Set<string>();
    for (const el of matchedElements) {
      if (seen.has(el)) continue;
      seen.add(el);
      let from = 0;
      while (from < raw.length) {
        const idx = raw.indexOf(el, from);
        if (idx === -1) break;
        spans.push({ start: idx, end: idx + el.length });
        from = idx + el.length;
      }
    }
  } else {
    let from = 0;
    while (from < raw.length) {
      const idx = raw.indexOf(q, from);
      if (idx === -1) break;
      spans.push({ start: idx, end: idx + q.length });
      from = idx + q.length;
    }
  }

  spans.sort((a, b) => a.start - b.start);
  const deduped: ElementPoolTextSpan[] = [];
  for (const s of spans) {
    if (deduped.some((d) => d.start === s.start && d.end === s.end)) continue;
    deduped.push(s);
  }
  return deduped;
}

function pickRandomUnique<T>(pool: T[], count: number): T[] {
  if (!pool.length || count <= 0) return [];
  const n = Math.min(count, pool.length);
  const copy = [...pool];
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy[idx]!);
    copy.splice(idx, 1);
  }
  return out;
}

function countsFromDiceStrength(strength: Step1DiceStrength): { elements: number; styles: number } {
  switch (strength) {
    case "single_element_single_style":
      return { elements: 1, styles: 1 };
    case "single_element_dual_style":
      return { elements: 1, styles: 2 };
    case "dual_element_single_style":
      return { elements: 2, styles: 1 };
    case "dual_element_dual_style":
      return { elements: 2, styles: 2 };
  }
}

export function buildDicePrompt(preset: Step1Preset): string {
  const { elements: elCount, styles: stCount } = countsFromDiceStrength(preset.diceStrength);
  const pickedElements = pickRandomUnique(preset.elements, elCount);
  const pickedStyleIds = pickRandomUnique(preset.styleIds, stCount);
  const pickedStyles = pickedStyleIds.map(styleLabelById);

  const obj = designObjectLabel(preset.designObject);
  const pickedMaterial = pickRandomUnique(preset.materials, 1)[0] ?? "s925";
  const mat = materialLabel(pickedMaterial);
  const theme = pickedElements.join("和");
  const styles = pickedStyles.join("和");

  return `设计一个${mat}的${obj}，以${theme}作为设计主题，以${styles}作为设计风格`;
}

export function loadStep1Presets(): Step1Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STEP1_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStep1Preset).filter((p): p is Step1Preset => p !== null);
  } catch {
    return [];
  }
}

export function saveStep1Presets(presets: Step1Preset[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STEP1_PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

export function loadActivePresetId(): string | null {
  if (typeof window === "undefined") return null;
  const id = window.localStorage.getItem(STEP1_ACTIVE_PRESET_STORAGE_KEY)?.trim();
  return id || null;
}

export function saveActivePresetId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (!id) window.localStorage.removeItem(STEP1_ACTIVE_PRESET_STORAGE_KEY);
  else window.localStorage.setItem(STEP1_ACTIVE_PRESET_STORAGE_KEY, id);
}

export function createPresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultPresetName(elements: string[], designObject: Step1DesignObject): string {
  const head = elements[0] ?? "未命名";
  const obj = designObject === "ring" ? "戒指" : "吊坠";
  return `${head}·${obj}`;
}

export const STEP1_PRESETS_EXPORT_VERSION = 1;

export type Step1PresetsExportFile = {
  version: number;
  exportedAt: string;
  presets: Step1Preset[];
};

export function buildStep1PresetsExportFile(presets: Step1Preset[]): Step1PresetsExportFile {
  return {
    version: STEP1_PRESETS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    presets,
  };
}

export function serializeStep1PresetsExport(presets: Step1Preset[]): string {
  return JSON.stringify(buildStep1PresetsExportFile(presets), null, 2);
}

export function step1PresetsExportFilename(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `gemmuse-step1-presets-${y}-${m}-${d}.json`;
}

/** 解析导入 JSON：支持导出包 `{ presets: [...] }` 或裸数组 `[...]` */
export function parseStep1PresetsImportJson(text: string): Step1Preset[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("JSON 格式无效，请检查文件内容。");
  }

  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as Step1PresetsExportFile).presets)) {
    list = (parsed as Step1PresetsExportFile).presets;
  } else {
    throw new Error("未找到预设列表，请使用 GemMuse 导出的 JSON 文件。");
  }

  const presets = list.map(normalizeStep1Preset).filter((p): p is Step1Preset => p !== null);
  if (!presets.length) {
    throw new Error("文件中没有有效的预设方案。");
  }
  return presets;
}

/** 导入时若 id 与本地冲突则分配新 id */
export function preparePresetsForImport(incoming: Step1Preset[], existing: Step1Preset[]): Step1Preset[] {
  const existingIds = new Set(existing.map((p) => p.id));
  const now = new Date().toISOString();
  return incoming.map((p) => {
    const id = existingIds.has(p.id) ? createPresetId() : p.id;
    if (!existingIds.has(p.id)) existingIds.add(id);
    return {
      ...p,
      id,
      createdAt: p.createdAt || now,
      updatedAt: now,
    };
  });
}

export function mergeImportedStep1Presets(current: Step1Preset[], incoming: Step1Preset[]): Step1Preset[] {
  const prepared = preparePresetsForImport(incoming, current);
  return [...prepared, ...current];
}
