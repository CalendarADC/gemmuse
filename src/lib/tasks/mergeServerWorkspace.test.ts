import { describe, expect, it } from "vitest";

import { defaultTaskWorkspaceMeta } from "@/lib/tasks/taskPersistence";

import { mergeTaskWorkspaceWithServer } from "./mergeServerWorkspace";

describe("mergeTaskWorkspaceWithServer", () => {
  it("returns local payload when server is null", () => {
    const local = {
      meta: defaultTaskWorkspaceMeta(),
      mainImages: [{ id: "m1", url: "https://x/m.png" }],
      mainHistoryImages: [],
      galleryImages: [],
      galleryHistoryImages: [],
    };
    expect(mergeTaskWorkspaceWithServer(local, null)).toBe(local);
  });

  it("merges server main row into history without dropping local-only mains", () => {
    const local = {
      meta: { ...defaultTaskWorkspaceMeta(), count: 1 },
      mainImages: [{ id: "local_only", url: "data:local" }],
      mainHistoryImages: [],
      galleryImages: [],
      galleryHistoryImages: [],
    };
    const server = {
      images: [
        {
          id: "srv1",
          kind: "main",
          url: "https://cdn/s.png",
          sourceMainImageId: null,
          debugPromptZh: null,
          createdAt: new Date().toISOString(),
        },
      ],
      copywriting: null,
    };
    const merged = mergeTaskWorkspaceWithServer(local, server);
    const ids = new Set(merged.mainHistoryImages.map((m) => m.id));
    expect(ids.has("local_only")).toBe(true);
    expect(ids.has("srv1")).toBe(true);
  });
});
