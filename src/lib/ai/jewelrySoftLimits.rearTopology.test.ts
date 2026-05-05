import { describe, expect, it } from "vitest";

import {
  buildPendantRearByTopologyBlock,
  buildPendantRearTopologyProbeBlock,
  classifyPendantRearTopologyFromPrompt,
} from "./jewelrySoftLimits";

describe("pendant rear topology two-stage", () => {
  it("classifies medallion/disk-like prompts as plate_back", () => {
    const c = classifyPendantRearTopologyFromPrompt("兔子圆盘吊坠，偏平背封底结构，背面雕花");
    expect(c).toBe("plate_back");
  });

  it("classifies volumetric relief prompts as relief_3d", () => {
    const c = classifyPendantRearTopologyFromPrompt("立体厚雕狮子头吊坠，背面也有起伏体量");
    expect(c).toBe("relief_3d");
  });

  it("builds topology-specific rear constraints", () => {
    const plate = buildPendantRearByTopologyBlock("plate_back");
    const relief = buildPendantRearByTopologyBlock("relief_3d");
    expect(plate).toContain("PLATE_BACK");
    expect(plate).toContain("near-planar sealed back");
    expect(relief).toContain("RELIEF_3D");
    expect(relief).toContain("volumetric relief family");
  });

  it("provides profile probe instructions", () => {
    const probe = buildPendantRearTopologyProbeBlock();
    expect(probe).toContain("PROFILE PROBE");
    expect(probe).toContain("85°-95° lateral orbit");
  });
});
