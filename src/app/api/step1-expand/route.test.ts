import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiAuth", () => ({
  requireApiActiveUser: vi.fn().mockResolvedValue({
    ok: false as const,
    response: new Response(JSON.stringify({ message: "未登录或会话已过期。" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  }),
}));

describe("POST /api/step1-expand", () => {
  it("returns 401 when user is not authenticated", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/step1-expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "test ring" }),
      })
    );
    expect(res.status).toBe(401);
  });
});
