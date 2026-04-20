import { describe, expect, it } from "vitest";

import {
  getInitToneLockInstruction,
  getStep3LeftRightGemstoneColorLockBlock,
} from "./enhancePromptBlocks";

describe("enhancePromptBlocks", () => {
  it("variant b is shorter than a for tone and gem locks", () => {
    const aTone = getInitToneLockInstruction("a");
    const bTone = getInitToneLockInstruction("b");
    const aGem = getStep3LeftRightGemstoneColorLockBlock("a");
    const bGem = getStep3LeftRightGemstoneColorLockBlock("b");
    expect(bTone.length).toBeLessThan(aTone.length);
    expect(bGem.length).toBeLessThan(aGem.length);
  });
});
