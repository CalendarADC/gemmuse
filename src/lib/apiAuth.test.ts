import { describe, expect, it, vi, beforeEach } from "vitest";

import { WEB_LOCAL_MODE_HEADER } from "@/lib/runtime/desktopLocalMode";

vi.mock("@/lib/auth", () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/authMode", () => ({
  isKeyOnlyAuthEnabled: vi.fn().mockReturnValue(true),
}));

describe("requireApiActiveUser (key-only)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("allows web-local client without session", async () => {
    const { requireApiActiveUser } = await import("./apiAuth");
    const result = await requireApiActiveUser(
      new Request("http://localhost/api/step1-expand", {
        headers: { [WEB_LOCAL_MODE_HEADER]: "1" },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authSource).toBe("web-local");
      expect(result.user.id).toBe("web-local-user");
    }
  });

  it("allows request when x-laozhang-api-key is set", async () => {
    const { requireApiActiveUser } = await import("./apiAuth");
    const result = await requireApiActiveUser(
      new Request("http://localhost/api/generate-main", {
        headers: { "x-laozhang-api-key": "sk-test-key-12345" },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authSource).toBe("api-key");
      expect(result.user.id).toMatch(/^key-/);
    }
  });
});
