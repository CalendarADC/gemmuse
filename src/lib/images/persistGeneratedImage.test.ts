import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    generatedImage: {
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}));

vi.mock("@/lib/storage/objectStorage", () => ({
  uploadPngBase64ToObjectStorage: vi.fn().mockResolvedValue(null),
}));

describe("persistGeneratedImage", () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({ id: "row1" });
  });

  it("falls back to data URL when object storage is unavailable", async () => {
    const { persistGeneratedImage } = await import("./persistGeneratedImage");
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const out = await persistGeneratedImage({
      userId: "u1",
      kind: "main",
      base64: b64,
      keyPrefix: "pfx",
    });
    expect(out.url.startsWith("data:image/png;base64,")).toBe(true);
    expect(createMock).toHaveBeenCalled();
    const data = createMock.mock.calls[0][0].data;
    expect(data.url).toBe(out.url);
    expect(data.objectKey).toBeNull();
  });
});
