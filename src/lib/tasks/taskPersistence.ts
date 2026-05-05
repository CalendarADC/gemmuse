import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";

import type {
  AIProvider,
  Copywriting,
  GalleryImage,
  MainImage,
  Step1ExpansionStrength,
  Step1ImageModel,
  StepBananaImageModel,
} from "@/store/jewelryGeneratorStore";

/** 旧版全局 IndexedDB 键（迁移用） */
export const LEGACY_IDB_KEYS = {
  main: "jewelry-generator-mainImages-v3",
  mainHist: "jewelry-generator-mainHistoryImages-v3",
  /** 旧版当前 Step3 展示图（若当时有单独持久化） */
  gallery: "jewelry-generator-galleryImages-v3",
  galleryHist: "jewelry-generator-galleryHistoryImages-v3",
} as const;

export function taskKeys(taskId: string) {
  const p = `jewelry-task-${taskId}`;
  return {
    meta: `${p}-meta`,
    main: `${p}-main`,
    mainHist: `${p}-mainHist`,
    gallery: `${p}-gallery`,
    galleryHist: `${p}-galleryHist`,
  };
}

export type TaskWorkspaceMeta = {
  provider: AIProvider;
  prompt: string;
  count: number;
  step1BananaImageModel?: StepBananaImageModel;
  step2BananaImageModel?: StepBananaImageModel;
  /** @deprecated IDB 遗留；迁移后不再写入 */
  step1ImageBackend?: "wuyin" | "laozhang" | null;
  step2ImageBackend?: "wuyin" | "laozhang" | null;
  /** @deprecated 旧版；仅用于从 IDB 迁移 */
  step1ImageModel?: Step1ImageModel;
  step2ImageModel?: Step1ImageModel;
  step1ExpansionStrength: Step1ExpansionStrength;
  step1FastMode: boolean;
  step2FastMode: boolean;
  laozhangApiKey?: string;
  selectedMainImageId: string | null;
  selectedMainImageUrl: string | null;
  selectedMainImageIds: string[];
  copywriting: Copywriting;
  lastTextModelUsed: string | null;
  lastImageCountPassed: number | null;
};

export const defaultTaskWorkspaceMeta = (): TaskWorkspaceMeta => ({
  provider: "nano-banana-pro",
  prompt: "",
  count: 1,
  step1BananaImageModel: "banana-pro",
  step2BananaImageModel: "banana-pro",
  step1ExpansionStrength: "standard",
  step1FastMode: false,
  step2FastMode: false,
  laozhangApiKey: "",
  selectedMainImageId: null,
  selectedMainImageUrl: null,
  selectedMainImageIds: [],
  copywriting: { title: "", tags: [], description: "" },
  lastTextModelUsed: null,
  lastImageCountPassed: null,
});

export function resolvedStep1BananaImageModel(meta: TaskWorkspaceMeta): StepBananaImageModel {
  if (
    meta.step1BananaImageModel === "banana-pro" ||
    meta.step1BananaImageModel === "banana-2" ||
    meta.step1BananaImageModel === "gpt-image-2"
  ) {
    return meta.step1BananaImageModel;
  }
  const legacy = meta.step1ImageModel;
  if (legacy === "banana-2") return "banana-2";
  if (legacy === "gpt-image-2") return "gpt-image-2";
  if (legacy === "banana-pro") return "banana-pro";
  if (meta.step1ImageBackend === "wuyin" || meta.step1ImageBackend === "laozhang") {
    return "banana-pro";
  }
  return "banana-pro";
}

export function resolvedStep2BananaImageModel(meta: TaskWorkspaceMeta): StepBananaImageModel {
  if (
    meta.step2BananaImageModel === "banana-pro" ||
    meta.step2BananaImageModel === "banana-2" ||
    meta.step2BananaImageModel === "gpt-image-2"
  ) {
    return meta.step2BananaImageModel;
  }
  const legacy2 = meta.step2ImageModel;
  if (legacy2 === "banana-2") return "banana-2";
  if (legacy2 === "gpt-image-2") return "gpt-image-2";
  if (legacy2 === "banana-pro") return "banana-pro";
  if (meta.step2ImageBackend === "wuyin" || meta.step2ImageBackend === "laozhang") {
    return "banana-pro";
  }
  return resolvedStep1BananaImageModel(meta);
}

export type TaskIdbPayload = {
  meta: TaskWorkspaceMeta;
  mainImages: MainImage[];
  mainHistoryImages: MainImage[];
  galleryImages: GalleryImage[];
  galleryHistoryImages: GalleryImage[];
};

export async function saveTaskToIdb(taskId: string, payload: TaskIdbPayload): Promise<void> {
  const k = taskKeys(taskId);
  // 先写 meta（体积小）：即使主图 data URL 过大导致后续写入失败，刷新后仍能恢复提示词与选项。
  await idbSet(k.meta, payload.meta);
  // 分键写入：避免 Promise.all 一单键配额失败导致整批回滚、其它键也落不下。
  const entries: Array<[string, unknown]> = [
    [k.main, payload.mainImages],
    [k.mainHist, payload.mainHistoryImages],
    [k.gallery, payload.galleryImages],
    [k.galleryHist, payload.galleryHistoryImages],
  ];
  for (const [key, val] of entries) {
    try {
      await idbSet(key, val);
    } catch (e) {
      console.warn(`[GemMuse] IndexedDB write failed (${key})`, e);
    }
  }
}

export async function loadTaskFromIdb(taskId: string): Promise<TaskIdbPayload> {
  const k = taskKeys(taskId);
  const [meta, main, mainHist, gallery, galleryHist] = await Promise.all([
    idbGet<TaskWorkspaceMeta | undefined>(k.meta),
    idbGet<MainImage[] | undefined>(k.main),
    idbGet<MainImage[] | undefined>(k.mainHist),
    idbGet<GalleryImage[] | undefined>(k.gallery),
    idbGet<GalleryImage[] | undefined>(k.galleryHist),
  ]);
  return {
    meta: meta ?? defaultTaskWorkspaceMeta(),
    mainImages: Array.isArray(main) ? main : [],
    mainHistoryImages: Array.isArray(mainHist) ? mainHist : [],
    galleryImages: Array.isArray(gallery) ? gallery : [],
    galleryHistoryImages: Array.isArray(galleryHist) ? galleryHist : [],
  };
}

export async function deleteTaskFromIdb(taskId: string): Promise<void> {
  const k = taskKeys(taskId);
  await Promise.all([
    idbDel(k.meta),
    idbDel(k.main),
    idbDel(k.mainHist),
    idbDel(k.gallery),
    idbDel(k.galleryHist),
  ]);
}

/**
 * 将旧版单工作区数据迁入指定 taskId。
 * 不删除旧键（多标签竞态）；新写入走 task 键。
 * 曾用「是否已有 meta」判断会误伤：debounce 可能只写过 meta，图片键仍空，导致永远不迁移。
 */
export async function migrateLegacyIdbToTask(taskId: string): Promise<boolean> {
  const [mainL, mainHistL, galleryL, galleryHistL] = await Promise.all([
    idbGet<MainImage[] | undefined>(LEGACY_IDB_KEYS.main),
    idbGet<MainImage[] | undefined>(LEGACY_IDB_KEYS.mainHist),
    idbGet<GalleryImage[] | undefined>(LEGACY_IDB_KEYS.gallery),
    idbGet<GalleryImage[] | undefined>(LEGACY_IDB_KEYS.galleryHist),
  ]);

  const legacyHas =
    (Array.isArray(mainL) && mainL.length > 0) ||
    (Array.isArray(mainHistL) && mainHistL.length > 0) ||
    (Array.isArray(galleryL) && galleryL.length > 0) ||
    (Array.isArray(galleryHistL) && galleryHistL.length > 0);
  if (!legacyHas) return false;

  const k = taskKeys(taskId);
  const [mainT, mainHistT, galleryT, galleryHistT] = await Promise.all([
    idbGet<MainImage[] | undefined>(k.main),
    idbGet<MainImage[] | undefined>(k.mainHist),
    idbGet<GalleryImage[] | undefined>(k.gallery),
    idbGet<GalleryImage[] | undefined>(k.galleryHist),
  ]);

  const taskHasStoredImages =
    (Array.isArray(mainT) && mainT.length > 0) ||
    (Array.isArray(mainHistT) && mainHistT.length > 0) ||
    (Array.isArray(galleryT) && galleryT.length > 0) ||
    (Array.isArray(galleryHistT) && galleryHistT.length > 0);

  if (taskHasStoredImages) return false;

  // 在此前多次 await 间隙，用户可能已向当前 task 写入 meta（例如 API Key）。避免用陈旧快照覆盖最新 meta。
  const metaFresh = await idbGet<TaskWorkspaceMeta | undefined>(k.meta);

  await saveTaskToIdb(taskId, {
    meta: metaFresh ?? defaultTaskWorkspaceMeta(),
    mainImages: Array.isArray(mainL) ? mainL : [],
    mainHistoryImages: Array.isArray(mainHistL) ? mainHistL : [],
    galleryImages: Array.isArray(galleryL) ? galleryL : [],
    galleryHistoryImages: Array.isArray(galleryHistL) ? galleryHistL : [],
  });

  return true;
}

/** 全量迁移曾跳过：任务里已有主图/历史但 `galleryImages` 仍空、旧全局键里仍有当前展示图时补写 */
export async function mergeLegacyGalleryOnlyIfMissing(taskId: string): Promise<boolean> {
  const galleryL = await idbGet<GalleryImage[] | undefined>(LEGACY_IDB_KEYS.gallery);
  if (!Array.isArray(galleryL) || galleryL.length === 0) return false;
  const k = taskKeys(taskId);
  const galleryT = await idbGet<GalleryImage[] | undefined>(k.gallery);
  if (Array.isArray(galleryT) && galleryT.length > 0) return false;
  const payload = await loadTaskFromIdb(taskId);
  await saveTaskToIdb(taskId, { ...payload, galleryImages: galleryL });
  return true;
}

let metaDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleDebouncedTaskMetaSave(
  taskId: string,
  meta: TaskWorkspaceMeta,
  ms = 450
): void {
  if (metaDebounceTimer) clearTimeout(metaDebounceTimer);
  metaDebounceTimer = setTimeout(() => {
    metaDebounceTimer = null;
    void idbSet(taskKeys(taskId).meta, meta).catch(() => undefined);
  }, ms);
}

export function flushDebouncedTaskMetaSave(): void {
  if (metaDebounceTimer) {
    clearTimeout(metaDebounceTimer);
    metaDebounceTimer = null;
  }
}