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
  material: Step1Material;
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

/** 解析英文逗号分隔的元素池（支持粘贴「小鸟,小鸡,小鸭子」） */
export function parseElementPoolInput(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatElementPool(elements: string[]): string {
  return elements.join(",");
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
  const mat = materialLabel(preset.material);
  const theme = pickedElements.join("和");
  const styles = pickedStyles.join("和");

  return `设计一个${mat}的${obj}，以${theme}作为设计主题，以${styles}作为设计风格`;
}

export function loadStep1Presets(): Step1Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STEP1_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Step1Preset[];
    return Array.isArray(parsed) ? parsed : [];
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
