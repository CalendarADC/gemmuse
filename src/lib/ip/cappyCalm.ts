/**
 * 「Cappy Calm」系列 IP：根据 Step1 文案中的材质关键词自动挂载官方参考图（见 public/references/cappy-calm/）。
 */

export type CappyCalmMaterialPreset = "s925" | "brass";

const IP_RE = /cappy\s*calm/i;

/** 与 public/references/cappy-calm/ 下文件名一致 */
export function cappyCalmReferencePublicPath(preset: CappyCalmMaterialPreset): string {
  return preset === "s925" ? "/references/cappy-calm/s925.png" : "/references/cappy-calm/brass.png";
}

/**
 * 命中 IP 名 + 明确材质时返回预设；否则 null（不自动加参考图）。
 * 黄铜优先于银关键词，避免「黄铜镀925」类文案误判。
 */
export function detectCappyCalmMaterialPreset(prompt: string): CappyCalmMaterialPreset | null {
  const t = prompt.trim();
  if (!t || !IP_RE.test(t)) return null;
  const brass = /(黄铜|\bbrass\b)/i.test(t);
  const silver = /(925|s925|sterling\s*silver|\bsterling\b|925银|925\s*银|纯银)/i.test(t);
  if (brass) return "brass";
  if (silver) return "s925";
  return null;
}

/** 注入到 Step1 最终 prompt：仅锁定脸型轮廓、身材比例与 bail；其余跟用户文案与模型发挥 */
export function buildCappyCalmCharacterLockBlock(preset: CappyCalmMaterialPreset): string {
  const sheet =
    preset === "s925"
      ? "first reference = official **925 sterling / oxidized silver** Cappy Calm character sheet."
      : "first reference = official **brass / warm gold-tone** Cappy Calm character sheet.";
  return [
    "CAPPY CALM IP — PARTIAL LOCK (reference vs. text):",
    sheet,
    "LOCK to the reference (keep close): **overall face shape / muzzle silhouette**, **chubby body massing and proportions** (torso-to-head scale, limb stubbiness), and **bail / hanger topology** (loop size, placement, attachment logic to the motif).",
    "FOLLOW the user TEXT prompt + creative latitude (not fixed by the reference): **facial expression**, **pose / action**, **clothing / props / accessories**, **scene, lighting, camera**, and **surface finish details** beyond the base alloy the user asked for.",
    "Still a **capybara-inspired** IP pendant — do not swap species; silhouette and bail read should remain on-brand with the sheet while expression, outfit, and staging stay flexible.",
    "Output: **one** manufacturable pendant hero, not a collage.",
  ].join("\n");
}
