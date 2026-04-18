import type { Copywriting, GalleryImage, GalleryImageType, MainImage } from "@/store/jewelryGeneratorStore";

import type { TaskIdbPayload, TaskWorkspaceMeta } from "@/lib/tasks/taskPersistence";

export type ServerWorkspaceRow = {
  id: string;
  kind: string;
  url: string;
  sourceMainImageId: string | null;
  debugPromptZh: string | null;
  createdAt: string;
};

export type ServerWorkspaceJson = {
  images: ServerWorkspaceRow[];
  copywriting: {
    title: string;
    tags: string[];
    description: string;
    lastTextModelUsed: string | null;
    lastImageCountPassed: number | null;
  } | null;
};

function parseTime(iso?: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function kindToGalleryType(kind: string): GalleryImageType | null {
  const k = kind.toLowerCase();
  const allowed: string[] = ["main", "on_model", "left", "right", "rear", "front", "top", "side"];
  if (!allowed.includes(k)) return null;
  return k as GalleryImageType;
}

/** 若 gallery 的 sourceMainImageId 在 mains 中不存在（旧客户端 id），按时间挂靠到最近的前一张主图。 */
function repairGallerySourceMainIds(gallery: GalleryImage[], mains: MainImage[]): GalleryImage[] {
  if (!mains.length) return gallery;
  const mainById = new Map(mains.map((m) => [m.id, m]));
  const sortedMains = [...mains].sort((a, b) => parseTime(a.createdAt) - parseTime(b.createdAt));
  return gallery.map((g) => {
    if (g.sourceMainImageId && mainById.has(g.sourceMainImageId)) return g;
    const gt = parseTime(g.createdAt);
    let best = sortedMains[0];
    for (const m of sortedMains) {
      if (parseTime(m.createdAt) <= gt) best = m;
      else break;
    }
    return { ...g, sourceMainImageId: best.id };
  });
}

/**
 * 合并本地与云端主图：按 id 并集。同 id 以云端为准（持久化 URL/字段更可信）。
 * 切勿在 server 非空时仅用 server 覆盖——否则会丢掉仅存在于 IndexedDB 的 Step2 历史，
 * 在 Step3 完成后触发 workspace 同步时表现为历史与输入被清空。
 */
function mergeMainsDedupe(localCurrent: MainImage[], localHist: MainImage[], server: MainImage[]): MainImage[] {
  const byId = new Map<string, MainImage>();
  for (const m of localHist) byId.set(m.id, m);
  for (const m of localCurrent) byId.set(m.id, m);
  for (const m of server) byId.set(m.id, m);
  return Array.from(byId.values()).sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt));
}

/** 同上：展示图历史与当前集合与云端并集，避免同步时冲掉未落库或合成 id 的本地条目。 */
function mergeGalleryDedupe(
  localHist: GalleryImage[],
  localCurrent: GalleryImage[],
  server: GalleryImage[]
): GalleryImage[] {
  const byId = new Map<string, GalleryImage>();
  for (const g of localHist) byId.set(g.id, g);
  for (const g of localCurrent) byId.set(g.id, g);
  for (const g of server) byId.set(g.id, g);
  const merged = Array.from(byId.values());
  merged.sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt));
  return merged;
}

/** 为云端拉回的 Step3 图补 setId（按主图 + 时间簇），并注入 synthetic main 卡片便于 Step3/4 分组。 */
function enrichServerGalleryWithSets(gallery: GalleryImage[], mains: MainImage[]): GalleryImage[] {
  const mainById = new Map(mains.map((m) => [m.id, m]));
  const CLUSTER_MS = 120_000;
  const sorted = [...gallery].sort((a, b) => parseTime(a.createdAt) - parseTime(b.createdAt));
  const out: GalleryImage[] = [];
  let clusterIdx = 0;
  for (let i = 0; i < sorted.length; ) {
    const anchor = sorted[i];
    const sid = anchor.sourceMainImageId;
    const main = sid ? mainById.get(sid) : undefined;
    const t0 = parseTime(anchor.createdAt);
    let j = i + 1;
    let prevT = t0;
    while (j < sorted.length) {
      const n = sorted[j];
      if (n.sourceMainImageId !== sid) break;
      const nt = parseTime(n.createdAt);
      if (nt - prevT > CLUSTER_MS) break;
      prevT = nt;
      j++;
    }
    const slice = sorted.slice(i, j);
    const setId = `cloud_${sid || "na"}_${t0}_${clusterIdx++}`;
    const setCreatedAt = slice[0]?.createdAt ?? new Date(t0).toISOString();
    // Step3 已在接口里写入 type=main 时，切勿再注入合成 main；否则每次 sync 会多一条同 URL 的「主图」，历史里出现多组重复大卡。
    const sliceAlreadyHasMain = slice.some((g) => g.type === "main");
    if (main?.url && !sliceAlreadyHasMain) {
      out.push({
        id: `cloud_inject_main_${setId}`,
        type: "main",
        url: main.url,
        sourceMainImageId: sid,
        setId,
        setCreatedAt,
        createdAt: setCreatedAt,
      });
    }
    for (const g of slice) {
      out.push({ ...g, setId, setCreatedAt });
    }
    i = j;
  }
  return out;
}

function pickLatestGallerySetAsCurrent(history: GalleryImage[]): GalleryImage[] {
  let bestTime = -1;
  let bestSet: string | null = null;
  for (const g of history) {
    if (!g.setId) continue;
    const t = parseTime(g.setCreatedAt ?? g.createdAt);
    if (t >= bestTime) {
      bestTime = t;
      bestSet = g.setId;
    }
  }
  if (!bestSet) return [];
  return history.filter((g) => g.setId === bestSet).sort((a, b) => parseTime(a.createdAt) - parseTime(b.createdAt));
}

const MAIN_TIME_CLUSTER_MS = 180_000;

/** 从主图列表中取「时间上最新的一簇」（簇内 createdAt 间隔 ≤ MAIN_TIME_CLUSTER_MS），再截断到 count。 */
export function pickLatestMainTimeCluster(mergedHistory: MainImage[], count: number): MainImage[] {
  const n = Math.min(5, Math.max(1, Math.floor(count)));
  const asc = [...mergedHistory].sort((a, b) => parseTime(a.createdAt) - parseTime(b.createdAt));
  if (!asc.length) return [];
  const tail: MainImage[] = [];
  for (let i = asc.length - 1; i >= 0; i--) {
    const m = asc[i]!;
    if (!tail.length) {
      tail.unshift(m);
      continue;
    }
    if (parseTime(tail[0]!.createdAt) - parseTime(m.createdAt) <= MAIN_TIME_CLUSTER_MS) tail.unshift(m);
    else break;
  }
  return tail.slice(-n);
}

function resolveMainImagesPanel(
  localPanel: MainImage[],
  count: number,
  mergedHistory: MainImage[]
): MainImage[] {
  const idSet = new Set(mergedHistory.map((m) => m.id));
  const kept = localPanel.filter((m) => idSet.has(m.id));
  const newestPanel = pickLatestMainTimeCluster(mergedHistory, count);
  if (kept.length) {
    const maxKept = Math.max(0, ...kept.map((m) => parseTime(m.createdAt)));
    const maxNewest = newestPanel.length
      ? Math.max(...newestPanel.map((m) => parseTime(m.createdAt)))
      : 0;
    // 本地「当前集」仍指向旧 id，但云端/合并历史里已有更新的主图簇（例如 Step1 已在服务端落库而本页未收到 fetch 响应）时，应切到最新簇。
    if (maxNewest > maxKept) return newestPanel;
    return kept;
  }
  return newestPanel;
}

function resolveGalleryPanel(localPanel: GalleryImage[], mergedHistory: GalleryImage[]): GalleryImage[] {
  const idSet = new Set(mergedHistory.map((g) => g.id));
  const kept = localPanel.filter((g) => idSet.has(g.id));
  if (kept.length) return kept;
  return pickLatestGallerySetAsCurrent(mergedHistory);
}

function mergeCopywriting(
  local: TaskWorkspaceMeta,
  server: ServerWorkspaceJson["copywriting"]
): Pick<TaskWorkspaceMeta, "copywriting" | "lastTextModelUsed" | "lastImageCountPassed"> {
  if (!server || (!server.title?.trim() && !server.description?.trim() && !(server.tags?.length ?? 0))) {
    return {
      copywriting: local.copywriting,
      lastTextModelUsed: local.lastTextModelUsed,
      lastImageCountPassed: local.lastImageCountPassed,
    };
  }
  const hasLocal =
    local.copywriting.title.trim() ||
    local.copywriting.description.trim() ||
    (local.copywriting.tags?.length ?? 0) > 0;
  if (!hasLocal) {
    return {
      copywriting: {
        title: server.title ?? "",
        tags: server.tags ?? [],
        description: server.description ?? "",
      } satisfies Copywriting,
      lastTextModelUsed: server.lastTextModelUsed,
      lastImageCountPassed: server.lastImageCountPassed,
    };
  }
  return {
    copywriting: {
      title: server.title || local.copywriting.title,
      tags: (server.tags?.length ?? 0) ? (server.tags ?? []) : local.copywriting.tags,
      description: server.description || local.copywriting.description,
    },
    lastTextModelUsed: server.lastTextModelUsed ?? local.lastTextModelUsed,
    lastImageCountPassed: server.lastImageCountPassed ?? local.lastImageCountPassed,
  };
}

export function mergeTaskWorkspaceWithServer(
  local: TaskIdbPayload,
  server: ServerWorkspaceJson | null
): TaskIdbPayload {
  if (!server) return local;

  const copyParts = mergeCopywriting(local.meta, server.copywriting);
  const base: TaskIdbPayload = {
    ...local,
    meta: { ...local.meta, ...copyParts },
  };

  if (!server.images?.length) {
    return base;
  }

  const serverMains: MainImage[] = [];
  const serverGalleryRaw: GalleryImage[] = [];

  for (const r of server.images ?? []) {
    if (r.kind === "main") {
      serverMains.push({
        id: r.id,
        url: r.url,
        createdAt: r.createdAt,
        debugPromptZh: r.debugPromptZh ?? undefined,
      });
    } else {
      const t = kindToGalleryType(r.kind);
      if (t && t !== "main") {
        serverGalleryRaw.push({
          id: r.id,
          type: t,
          url: r.url,
          sourceMainImageId: r.sourceMainImageId ?? "",
          debugPromptZh: r.debugPromptZh ?? undefined,
          createdAt: r.createdAt,
        });
      }
    }
  }

  const mergedMainHist = mergeMainsDedupe(local.mainImages, local.mainHistoryImages, serverMains);
  const repaired = repairGallerySourceMainIds(serverGalleryRaw, mergedMainHist);
  const serverGalleryEnriched = enrichServerGalleryWithSets(repaired, mergedMainHist);
  const mergedGalleryHist = mergeGalleryDedupe(
    local.galleryHistoryImages,
    local.galleryImages,
    serverGalleryEnriched
  );

  const mainImages = resolveMainImagesPanel(base.mainImages, base.meta.count, mergedMainHist);
  const galleryImages = resolveGalleryPanel(base.galleryImages, mergedGalleryHist);

  return {
    ...base,
    mainImages,
    mainHistoryImages: mergedMainHist,
    galleryImages,
    galleryHistoryImages: mergedGalleryHist,
  };
}

export async function fetchTaskWorkspaceFromServer(taskId: string): Promise<ServerWorkspaceJson | null> {
  try {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/workspace`);
    if (!res.ok) return null;
    return (await res.json()) as ServerWorkspaceJson;
  } catch {
    return null;
  }
}
