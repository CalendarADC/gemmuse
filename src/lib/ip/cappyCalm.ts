/**
 * 「Cappy Calm」系列 IP：根据 Step1 文案中的材质关键词自动挂载官方参考图（见 public/references/cappy-calm/）。
 */

export type CappyCalmMaterialPreset = "s925" | "goldPlated";

const IP_RE = /cappy\s*calm/i;

/** 镀金系关键词：与 IP 名同时出现时挂载原「黄铜板」实拍（现为镀金版本读法）。 */
const GOLD_PLATED_RE =
  /(镀金|电镀金|包金|金色镀层|gold[\s-]*plated|pvd\s*金|黄铜|\bbrass\b)/i;

/** 与 public/references/cappy-calm/ 下文件名一致；925 银含主造型 + 户外露营变体两张。 */
export function cappyCalmReferencePublicPaths(preset: CappyCalmMaterialPreset): readonly string[] {
  if (preset === "s925") {
    return ["/references/cappy-calm/s925.png", "/references/cappy-calm/s925-camping.png"] as const;
  }
  return ["/references/cappy-calm/gold-plated.png"] as const;
}

/**
 * 命中 IP 名 + 明确材质时返回预设；否则 null（不自动加参考图）。
 * 镀金系（含 legacy「黄铜/brass」写法）优先于银关键词，避免「925 银镀金」类文案误判为纯银双板。
 */
export function detectCappyCalmMaterialPreset(prompt: string): CappyCalmMaterialPreset | null {
  const t = prompt.trim();
  if (!t || !IP_RE.test(t)) return null;
  const goldPlated = GOLD_PLATED_RE.test(t);
  const silver = /(925|s925|sterling\s*silver|\bsterling\b|925银|925\s*银|纯银)/i.test(t);
  if (goldPlated) return "goldPlated";
  if (silver) return "s925";
  return null;
}

/** 注入到 Step1 最终 prompt：仅锁定脸型轮廓、身材比例与 bail；其余跟用户文案与模型发挥 */
export function buildCappyCalmCharacterLockBlock(preset: CappyCalmMaterialPreset): string {
  const sheet =
    preset === "s925"
      ? "the **first one or two references** are official **925 sterling / oxidized silver** Cappy Calm sheets (classic hero + outdoor/camping variant) — same IP read for proportions and bail."
      : "the **first reference** is the official **gold-plated / warm gold-tone** Cappy Calm character sheet.";
  return [
    "CAPPY CALM IP — PARTIAL LOCK (reference vs. text):",
    sheet,
    "LOCK to the reference (keep close): **overall face shape / muzzle silhouette**, **chubby body massing and proportions** (torso-to-head scale, limb stubbiness), and **bail / hanger topology** (loop size, placement, attachment logic to the motif).",
    "FOLLOW the user TEXT prompt + creative latitude (not fixed by the reference): **facial expression**, **pose / action**, **clothing / props / accessories**, **scene, lighting, camera**, and **surface finish details** beyond the base alloy the user asked for.",
    "Still a **capybara-inspired** IP pendant — do not swap species; silhouette and bail read should remain on-brand with the sheet while expression, outfit, and staging stay flexible.",
    "Output: **one** manufacturable pendant hero, not a collage.",
  ].join("\n");
}
