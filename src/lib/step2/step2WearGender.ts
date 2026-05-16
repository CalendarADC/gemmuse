import type { JewelryProductKind } from "@/lib/ai/jewelrySoftLimits";

export type Step2WearGender = "male" | "female";

export function step2WearGenderButtonLabel(gender: Step2WearGender | null): string {
  if (gender === "male") return "男";
  if (gender === "female") return "女";
  return "穿";
}

/** 用户已选性别时，由 AI 在固定性别下自选最适合该 SKU 的穿戴构图 */
export function buildWearPresentationStrategyBlock(kind: JewelryProductKind): string {
  if (kind === "ring") {
    return [
      "WEARING PRESENTATION STRATEGY (strict): User fixed wearer gender — you must choose the **best on-hand presentation** for this exact ring SKU.",
      "Pick the optimal finger (index / middle / ring finger per rules below), hand pose, and crop so the ring remains the clear hero — NOT a duplicate tabletop packshot.",
      "Show believable full-hand or strong 3/4 hand context; natural anatomy and scale.",
    ].join("\n");
  }
  return [
    "WEARING PRESENTATION STRATEGY (strict): User fixed wearer gender — you must choose the **best on-neck / on-body presentation** for this exact pendant SKU.",
    "Pick neckline, chain length, drape, and torso crop so the pendant + bail remain the clear hero — NOT a duplicate flat tabletop hero.",
    "Chain must read as worn with gravity; bail topology unchanged from init.",
  ].join("\n");
}

export function buildWearGenderPresentationBlock(
  gender: Step2WearGender,
  kind: JewelryProductKind
): string {
  const strategy = buildWearPresentationStrategyBlock(kind);
  if (gender === "male") {
    return [
      "USER SELECTED WEARER: **Adult male** (strict). Output must read as a man wearing the jewelry — masculine hand/neck proportions, natural male skin texture.",
      kind === "ring"
        ? "Male hand wearing the ring; believable knuckle scale; no feminine manicure or slender fashion-hand tropes unless the SKU is explicitly unisex."
        : "Male upper chest / neck wearing the pendant on chain or cord; masculine styling; no feminine décolletage fashion cues unless SKU demands.",
      strategy,
    ].join("\n");
  }
  return [
    "USER SELECTED WEARER: **Adult female** (strict). Output must read as a woman wearing the jewelry — natural female hand/neck proportions.",
    kind === "ring"
      ? "Female hand wearing the ring; elegant believable scale; may use refined manicure consistent with luxury catalog."
      : "Female neck / upper torso wearing the pendant; chain drapes naturally; refined on-model necklace presentation.",
    strategy,
  ].join("\n");
}

export function buildRingMensOnModelPresentationBlock(): string {
  return [
    "MEN'S-RING ON-MODEL (strict): premium men's jewelry e-commerce / editorial quality.",
    "HAND READ: natural **adult male** hand — believable knuckle width, tendons, and skin texture (NOT plastic). European / North American or neutral international male hand type acceptable.",
    "FULL-HAND FRAMING: show **most of the hand** in a calm 3/4 or relaxed pose; ring clearly visible on index, middle, or ring finger — NOT an extreme single-finger macro.",
    "MANICURE: short natural nails or minimal grooming — no long feminine nail art.",
    "BACKGROUND: clean studio / quiet luxury neutral (warm gray, beige, soft blur) — Etsy-friendly, uncluttered.",
    "LIGHTING: soft diffused studio wrap; crisp metal and stone speculars.",
  ].join("\n");
}
