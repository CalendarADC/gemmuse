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

  it("localMode writes PNG under GEMMUSE_LOCAL_MEDIA_DIR and returns /api/local-media URL", async () => {
    vi.resetModules();
    const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "gm-media-"));
    process.env.GEMMUSE_LOCAL_MEDIA_DIR = dir;
    const { persistGeneratedImage } = await import("./persistGeneratedImage");
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const out = await persistGeneratedImage({
      userId: "u-test",
      kind: "main",
      base64: b64,
      keyPrefix: "users/u-test/step1",
      localMode: true,
    });
    expect(out.url.startsWith("/api/local-media/")).toBe(true);
    expect(createMock).not.toHaveBeenCalled();
    const tail = out.url.slice("/api/local-media/".length);
    const relParts = tail.split("/").map((p) => decodeURIComponent(p));
    const abs = join(dir, ...relParts);
    const png = readFileSync(abs);
    expect(png[0]).toBe(0x89);
    rmSync(dir, { recursive: true, force: true });
    delete process.env.GEMMUSE_LOCAL_MEDIA_DIR;
  });
});
