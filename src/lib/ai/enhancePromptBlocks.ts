import type { JewelryProductKind } from "@/lib/ai/jewelrySoftLimits";

/** 与客户端/调试日志对齐：左右视图与影调辅助块变更时递增。 */
export const ENHANCE_LR_TONE_BLOCKS_VERSION = "2026-04-1";

/**
 * A/B：`a` 为当前默认长文案；`b` 为压缩版（左右/影调锁），减少无效 token。
 * 环境变量 `STEP3_LR_PROMPT_AB=b` 启用 B。
 */
export function getStep3LeftRightPromptVariant(): "a" | "b" {
  const v = process.env.STEP3_LR_PROMPT_AB?.trim().toLowerCase();
  return v === "b" ? "b" : "a";
}

export function getInitToneLockInstruction(variant: "a" | "b"): string {
  if (variant === "b") {
    return [
      "INIT TONE LOCK: match init warm grade (cushion/wood/highlight depth). No gray haze or catalog re-grade.",
      "Keep same exposure/WB/saturation intent vs reference; forbid global relight that dulls metal.",
    ].join(" ");
  }
  return [
    "INIT TONE LOCK (absolute): keep the same warm scene grade as init (same cushion cream hue, same wood warmth, same highlight sparkle intensity, same shadow depth). Do NOT apply gray cast, low-contrast wash, matte fog, or auto relight that makes metal look dull.",
  ].join("\n");
}

export function getStep3LeftRightGemstoneColorLockBlock(variant: "a" | "b"): string {
  if (variant === "b") {
    return [
      "GEM HUE LOCK (left/right): keep each stone's base hue vs init; forbid hue shifts that mimic camera move.",
      "Highlights may move; underlying stone color/saturation/count must not change.",
    ].join(" ");
  }
  return [
    "GEMSTONE COLOR / HUE LOCK (strict ? left/right only):",
    "Every visible gem (center stone, eyes, accents) must keep the **same base hue and body color** as the init ? e.g. **blue stays blue**, **green stays green**.",
    "**FORBID** recoloring stones to simulate variety when the camera did not actually move. Gem hue shifts = **incorrect** output for this brief.",
    "Specular highlights may relocate with light; **do not** change underlying stone color, saturation, or apparent species/count.",
  ].join("\n");
}

/** 仅戒指需要 inner shank 约束时注入，吊坠跳过以省 token。 */
export function getRingInnerSurfaceLockBlock(kind: JewelryProductKind): string {
  if (kind !== "ring") return "";
  return [
    "RING INNER SURFACE LOCK (strict, all Step3 views):",
    "The finger-contact inner loop must remain a smooth, continuous, mirror-polished 360-degree finished band (finished jewelry quality).",
    "No true dents and no fake dents from lighting/shadow illusion: avoid shading/specular patterns that make the inner loop look concave, sunken, grooved, ridged, or seamed.",
    "FORBID: inner dent, inner pit/dimple, groove inside shank, concave trench, raised inner ridge, seam-like line, casting seam, inner engraving/text/filigree. Decorations stay on outer/top surfaces only.",
  ].join("\n");
}
