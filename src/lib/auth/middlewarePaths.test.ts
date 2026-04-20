import { describe, expect, it } from "vitest";

import { isProtectedPath, isPublicPath } from "./middlewarePaths";

describe("middlewarePaths", () => {
  it("treats step1-expand API like other generation routes", () => {
    expect(isProtectedPath("/api/step1-expand")).toBe(true);
  });

  it("allows auth and register API without extra protection flag", () => {
    expect(isPublicPath("/api/auth/signin")).toBe(true);
    expect(isPublicPath("/api/register")).toBe(true);
  });

  it("protects create and tasks", () => {
    expect(isProtectedPath("/create/design")).toBe(true);
    expect(isProtectedPath("/api/tasks")).toBe(true);
  });
});
