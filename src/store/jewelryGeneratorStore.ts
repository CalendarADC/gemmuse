"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { set as idbSet } from "idb-keyval";

import {
  defaultTaskWorkspaceMeta,
  deleteTaskFromIdb,
  flushDebouncedTaskMetaSave,
  loadTaskFromIdb,
  mergeLegacyGalleryOnlyIfMissing,
  migrateLegacyIdbToTask,
  resolvedStep1BananaImageModel,
  resolvedStep2BananaImageModel,
  saveTaskToIdb,
  scheduleDebouncedTaskMetaSave,
  taskKeys,
  type TaskIdbPayload,
  type TaskWorkspaceMeta,
} from "@/lib/tasks/taskPersistence";
import { resolveCappyCalmStep1ReferenceDataUrls } from "@/lib/ip/resolveCappyCalmStep1References";
import {
  fetchTaskWorkspaceFromServer,
  mergeTaskWorkspaceWithServer,
  pickLatestMainTimeCluster,
} from "@/lib/tasks/mergeServerWorkspace";

/** Step1 点击生成瞬间已有的主图 id；用于在请求挂起/刷新后从 workspace 识别「本轮」新图。 */
let step1RecoverPreMainIdSet: ReadonlySet<string> | null = null;

/** 将浏览器/Node 的 fetch 连接失败转为可读中文提示 */
function friendlyFetchErrorMessage(e: unknown): string | undefined {
  if (!(e instanceof Error)) return undefined;
  const msg = e.message;
  if (
    msg === "fetch failed" ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
  ) {
    return "无法连接服务器：请确认已在项目目录运行 npm run dev，并在浏览器打开 http://localhost:3000 后再试。";
  }
  return msg;
}

export type AIProvider = "nano-banana-pro" | "chatgpt-1.5";
export type Step1ExpansionStrength = "standard" | "strong";
/** Step1/2：老张 Banana pro（Pro）与 Banana 2（Flash） */
export type StepBananaImageModel = "banana-pro" | "banana-2";
/** @deprecated 仅旧 IDB meta 迁移 */
export type Step1ImageModel = "banana-pro" | "banana-2";

export type MainImage = {
  id: string;
  url: string;
  createdAt?: string;
  /** 是否收藏（用于历史记录防误删） */
  isFavorite?: boolean;
  /** 该图像对应的（中文呈现的）最终提示词调试信息 */
  debugPromptZh?: string;
};

export type GalleryImageType =
  | "main"
  | "on_model"
  | "left"
  | "right"
  | "rear"
  | "front"
  /** 旧版俯视图，仅兼容历史记录；新生成不再产生 */
  | "top"
  /** 旧版「侧视图」，仅兼容历史记录；新生成不再产生 */
  | "side";

export type GalleryImage = {
  id: string;
  type: GalleryImageType;
  url: string;
  sourceMainImageId: string;
  /** 是否收藏（用于历史记录防误删） */
  isFavorite?: boolean;
  /** 该展示图对应的（中文呈现的）最终提示词调试信息 */
  debugPromptZh?: string;
  /**
   * 同一次 Step3 生成（点击“生成展示图组合”）的多张图会共享该 setId，用于历史记录分组。
   */
  setId?: string;
  setCreatedAt?: string;
  createdAt?: string;
};

export type GalleryImageSelector = {
  id: string;
  setId?: string;
  sourceMainImageId: string;
  type: GalleryImageType;
  createdAt?: string;
};

function galleryImageSelectorKey(s: GalleryImageSelector): string {
  return [s.id, s.setId ?? "", s.sourceMainImageId, s.type, s.createdAt ?? ""].join("::");
}

export type Copywriting = {
  title: string;
  tags: string[]; // Etsy: 13 高流量标签（这里不强制长度，后续可补齐/校验）
  description: string;
};

/** 左侧任务分组：每个任务有独立工作区（IndexedDB 按 taskId 分库存） */
export type GeneratorTask = {
  id: string;
  name: string;
  sortOrder?: number;
  currentStep?: "STEP1" | "STEP2" | "STEP3" | "STEP4";
  createdAt: string;
  updatedAt: string;
  /** 用于搜索与侧栏摘要，仅保留约 160 字 */
  searchLine: string;
  /**
   * 最近一次 Step1 生图**成功**时使用的完整提示词（不截断），随 tasks 写入 localStorage，
   * 用于刷新后恢复输入框全文；与 searchLine 并存。
   */
  lastSuccessPrompt?: string;
  /** 为 true 时不可删除（随 tasks 持久化到 localStorage） */
  isProtected?: boolean;
};

type GeneratorStatus = {
  step1Generating: boolean;
  step3Generating: boolean;
  step4Generating: boolean;
  /** 各步生成开始时间（ms），用于跨页面卸载后仍能连续计时 */
  step1GenerationStartedAt: number | null;
  step3GenerationStartedAt: number | null;
  step4GenerationStartedAt: number | null;
};

function idleGeneratorStatus(): GeneratorStatus {
  return {
    step1Generating: false,
    step3Generating: false,
    step4Generating: false,
    step1GenerationStartedAt: null,
    step3GenerationStartedAt: null,
    step4GenerationStartedAt: null,
  };
}

function withStep1Generating(s: GeneratorStatus, on: boolean): GeneratorStatus {
  return { ...s, step1Generating: on, step1GenerationStartedAt: on ? Date.now() : null };
}

function withStep3Generating(s: GeneratorStatus, on: boolean): GeneratorStatus {
  return { ...s, step3Generating: on, step3GenerationStartedAt: on ? Date.now() : null };
}

function withStep4Generating(s: GeneratorStatus, on: boolean): GeneratorStatus {
  return { ...s, step4Generating: on, step4GenerationStartedAt: on ? Date.now() : null };
}

type ApiError = {
  message?: string;
};

function clampCount(v: number) {
  if (!Number.isFinite(v)) return 1;
  return Math.min(5, Math.max(1, Math.floor(v)));
}

type JewelryGeneratorStore = {
  // ========== 多任务 ==========
  tasks: GeneratorTask[];
  activeTaskId: string;

  // ========== 全局配置 / 输入 ==========
  provider: AIProvider;
  prompt: string;
  count: number;
  step1BananaImageModel: StepBananaImageModel;
  step2BananaImageModel: StepBananaImageModel;
  step1ExpansionStrength: Step1ExpansionStrength;
  step1FastMode: boolean;
  step2FastMode: boolean;
  /** Step1 可选参考图（data URL），最多 3 张；不写入 persist */
  step1ReferenceImageDataUrls: string[];

  // ========== Step 1 输出 ==========
  mainImages: MainImage[];
  // 历史主图：用于 Step 2 查看历史记录（隐藏当前集外的旧版本）
  mainHistoryImages: MainImage[];
  selectedMainImageId: string | null;
  selectedMainImageUrl: string | null;
  // Step2 支持多选：用于 Step3 批量生成其他角度
  selectedMainImageIds: string[];

  // ========== Step 3 输出 ==========
  galleryImages: GalleryImage[];

  // ========== Step 3 历史记录 ==========
  // 用于查看历史生成的 Step3 结果；Step4 仍然只使用 galleryImages（当前集合）。
  galleryHistoryImages: GalleryImage[];

  // ========== Step 4 输出 ==========
  copywriting: Copywriting;

  // ========== UI 状态 ==========
  status: GeneratorStatus;
  error: string | null;
  lastTextModelUsed: string | null;
  lastImageCountPassed: number | null;

  // ========== Actions ==========
  setProvider: (provider: AIProvider) => void;
  setPrompt: (prompt: string) => void;
  setCount: (count: number) => void;
  setStep1BananaImageModel: (v: StepBananaImageModel) => void;
  setStep2BananaImageModel: (v: StepBananaImageModel) => void;
  setStep1ExpansionStrength: (v: Step1ExpansionStrength) => void;
  setStep1FastMode: (v: boolean) => void;
  setStep2FastMode: (v: boolean) => void;
  addStep1ReferenceImage: (dataUrl: string) => boolean;
  removeStep1ReferenceImageAt: (index: number) => void;
  clearStep1ReferenceImages: () => void;
  resetAll: () => void;

  createNewTask: (name?: string) => Promise<void>;
  syncTasksFromServer: () => Promise<void>;
  syncActiveTaskWorkspaceFromServer: () => Promise<void>;
  switchTask: (taskId: string) => Promise<void>;
  renameTask: (taskId: string, name: string) => void;
  setTaskProtected: (taskId: string, isProtected: boolean) => void;
  deleteTask: (taskId: string) => Promise<void>;
  /** 将 draggedId 移到 targetId 之前（顺序仅由 tasks 数组决定，与 updatedAt 无关） */
  reorderTasks: (draggedId: string, targetId: string) => void;

  // Step 1: 生成主视图（成功且至少一张图时返回 true，供界面跳转 Step2）
  generateMainImages: () => Promise<boolean>;
  /** 生成中轮询：若服务端已有本轮新主图则合并状态并返回 true（供跳转 Step2）。 */
  recoverStep1FromServerIfComplete: () => Promise<boolean>;
  regenerateMainImage: (id: string) => Promise<void>;

  // Step 2: 选择主视图
  selectMainImage: (id: string) => void;
  toggleMainImageSelection: (id: string) => void;
  setMainImageSelection: (ids: string[]) => void;

  // Step 3: 更新增强后的图片集合
  replaceGalleryImages: (images: GalleryImage[]) => void;
  addGalleryImages: (images: GalleryImage[]) => void;
  clearGalleryImages: () => void;
  enhanceGalleryImages: (args: {
    onModel: boolean;
    left: boolean;
    right: boolean;
    rear: boolean;
    front?: boolean;
  }) => Promise<boolean>;
  // Step 3: 单张展示图刷新（只替换对应 type/sourceMainImageId 的版本）
  regenerateGalleryImage: (imageId: string) => Promise<void>;

  // Step2/Step3 历史记录删除
  toggleMainHistoryFavorite: (id: string) => void;
  toggleGalleryHistoryFavoriteBySelector: (selector: GalleryImageSelector) => void;
  /** 成功更新本地（且云端删除成功或无需删云端）时返回 true */
  deleteMainHistoryImagesByIds: (ids: string[]) => Promise<boolean>;
  deleteGalleryHistoryImagesBySelectors: (selectors: GalleryImageSelector[]) => void;

  // 从历史集合中切换到指定 setId 对应的当前集合（用于 Step4）
  setGallerySetAsCurrent: (setId: string) => void;

  // Step 4: 设置/生成文案
  setCopywriting: (next: Copywriting) => void;
  generateCopywriting: () => Promise<void>;
};

const emptyCopywriting: Copywriting = { title: "", tags: [], description: "" };

function newTaskId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function seedGeneratorTask(name: string): GeneratorTask {
  const now = new Date().toISOString();
  return {
    id: newTaskId(),
    name,
    sortOrder: 0,
    currentStep: "STEP1",
    createdAt: now,
    updatedAt: now,
    searchLine: "",
    isProtected: false,
  };
}

type ServerTask = {
  id: string;
  name: string;
  searchLine: string;
  isProtected: boolean;
  sortOrder: number;
  currentStep: "STEP1" | "STEP2" | "STEP3" | "STEP4";
  createdAt: string;
  updatedAt: string;
};

async function fetchServerTasks(): Promise<ServerTask[]> {
  const res = await fetch("/api/tasks", { method: "GET" });
  if (!res.ok) throw new Error(`任务同步失败（HTTP ${res.status}）`);
  const data = (await res.json().catch(() => ({}))) as { tasks?: ServerTask[] };
  return Array.isArray(data.tasks) ? data.tasks : [];
}

const initialSidebarTask = seedGeneratorTask("任务 1");

function pickTaskMeta(s: JewelryGeneratorStore): TaskWorkspaceMeta {
  return {
    provider: s.provider,
    prompt: s.prompt,
    count: s.count,
    step1BananaImageModel: s.step1BananaImageModel,
    step2BananaImageModel: s.step2BananaImageModel,
    step1ExpansionStrength: s.step1ExpansionStrength,
    step1FastMode: s.step1FastMode,
    step2FastMode: s.step2FastMode,
    selectedMainImageId: s.selectedMainImageId,
    selectedMainImageUrl: s.selectedMainImageUrl,
    selectedMainImageIds: s.selectedMainImageIds,
    copywriting: s.copywriting,
    lastTextModelUsed: s.lastTextModelUsed,
    lastImageCountPassed: s.lastImageCountPassed,
  };
}

async function persistActiveWorkspace(s: JewelryGeneratorStore): Promise<void> {
  await saveTaskToIdb(s.activeTaskId, {
    meta: pickTaskMeta(s),
    mainImages: s.mainImages,
    mainHistoryImages: s.mainHistoryImages,
    galleryImages: s.galleryImages,
    galleryHistoryImages: s.galleryHistoryImages,
  });
}

/**
 * 若 IndexedDB 读到的仍是空快照（例如：生图中途 subscribe 曾把空 main 写入、或与 persist 竞态），
 * 而内存里已有本次工作区，则以内存为准，避免 hydration 把刚生成的图和提示词清空。
 */
function mergeLoadedWorkspaceWithMemory(activeId: string, loaded: TaskIdbPayload): TaskIdbPayload {
  const mem = useJewelryGeneratorStore.getState();
  if (mem.activeTaskId !== activeId) return loaded;

  const idbEmptyVisual =
    loaded.mainImages.length === 0 &&
    loaded.mainHistoryImages.length === 0 &&
    loaded.galleryImages.length === 0 &&
    loaded.galleryHistoryImages.length === 0;
  const memHasVisual =
    mem.mainImages.length > 0 ||
    mem.mainHistoryImages.length > 0 ||
    mem.galleryImages.length > 0 ||
    mem.galleryHistoryImages.length > 0;

  if (idbEmptyVisual && memHasVisual) {
    return {
      ...loaded,
      mainImages: mem.mainImages,
      mainHistoryImages: mem.mainHistoryImages,
      galleryImages: mem.galleryImages,
      galleryHistoryImages: mem.galleryHistoryImages,
      meta: { ...loaded.meta, ...pickTaskMeta(mem) },
    };
  }

  if (!loaded.meta.prompt.trim() && mem.prompt.trim()) {
    return {
      ...loaded,
      meta: { ...loaded.meta, ...pickTaskMeta(mem) },
    };
  }

  return loaded;
}

/** 按任务备份当前输入框全文（防抖）；另有 tasks.lastSuccessPrompt 记录上次生图成功时的完整 prompt */
const LS_TASK_PROMPT_KEY = (id: string) => `jewelry-gem-task-prompt-v1-${id}`;
let promptBackupTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleTaskPromptBackup(taskId: string, prompt: string) {
  if (typeof window === "undefined") return;
  if (promptBackupTimer) clearTimeout(promptBackupTimer);
  promptBackupTimer = setTimeout(() => {
    promptBackupTimer = null;
    try {
      if (!prompt.trim()) {
        localStorage.removeItem(LS_TASK_PROMPT_KEY(taskId));
        return;
      }
      localStorage.setItem(LS_TASK_PROMPT_KEY(taskId), prompt);
    } catch {
      /* quota */
    }
  }, 400);
}

function flushTaskPromptBackup(taskId: string, prompt: string) {
  if (typeof window === "undefined") return;
  if (promptBackupTimer) {
    clearTimeout(promptBackupTimer);
    promptBackupTimer = null;
  }
  try {
    if (!prompt.trim()) {
      localStorage.removeItem(LS_TASK_PROMPT_KEY(taskId));
      return;
    }
    localStorage.setItem(LS_TASK_PROMPT_KEY(taskId), prompt);
  } catch {
    /* quota */
  }
}

function readTaskPromptBackup(taskId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(LS_TASK_PROMPT_KEY(taskId)) ?? "";
  } catch {
    return "";
  }
}

function clearTaskPromptBackup(taskId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LS_TASK_PROMPT_KEY(taskId));
  } catch {
    /* ignore */
  }
}

/**
 * 刷新后合并提示词：IDB meta 可能空，但 zustand persist 已从 localStorage 恢复 prompt（此前未 partialize 时 snap.prompt 恒为空）。
 * 优先级：IDB meta → store（含 LS 恢复的 prompt）→ 备份键 → 上次生图全文 → 侧栏摘要。
 */
function resolveWorkspacePromptForHydrate(
  activeId: string,
  loadedMetaPrompt: string,
  activeTask: GeneratorTask | undefined
): string {
  const fromMeta = loadedMetaPrompt.trim();
  const fromStore = useJewelryGeneratorStore.getState().prompt.trim();
  const fromBackup = readTaskPromptBackup(activeId).trim();
  const fromLastSuccess = activeTask?.lastSuccessPrompt?.trim() ?? "";
  const fromLine = activeTask?.searchLine?.trim() ?? "";
  return fromMeta || fromStore || fromBackup || fromLastSuccess || fromLine || "";
}

/** persist 完成并从 IndexedDB 合并工作区前，禁止写入，避免覆盖空状态 */
let tasksHydrated = false;

export const useJewelryGeneratorStore = create<JewelryGeneratorStore>()(
  persist(
    (set, get) => ({
      tasks: [initialSidebarTask],
      activeTaskId: initialSidebarTask.id,

      provider: "nano-banana-pro",
      prompt: "",
      count: 1,
      step1BananaImageModel: "banana-pro",
      step2BananaImageModel: "banana-pro",
      step1ExpansionStrength: "standard",
      step1FastMode: false,
      step2FastMode: false,
      step1ReferenceImageDataUrls: [],

      mainImages: [],
      mainHistoryImages: [],
      selectedMainImageId: null,
      selectedMainImageUrl: null,
      selectedMainImageIds: [],

      galleryImages: [],
      galleryHistoryImages: [],
      copywriting: emptyCopywriting,

      status: idleGeneratorStatus(),
      error: null,
      lastTextModelUsed: null,
      lastImageCountPassed: null,

      setProvider: (provider) => {
        set({ provider });
        const s = get();
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s.activeTaskId, pickTaskMeta(s));
      },
      setPrompt: (prompt) => {
        set((state) => ({
          prompt,
          error: null,
          tasks: state.tasks.map((t) =>
            t.id === state.activeTaskId
              ? { ...t, searchLine: prompt.trim().slice(0, 160) }
              : t
          ),
        }));
        const s = get();
        scheduleTaskPromptBackup(s.activeTaskId, prompt);
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s.activeTaskId, pickTaskMeta(s));
      },
      setCount: (count) => {
        set({ count: clampCount(count) });
        const s = get();
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s.activeTaskId, pickTaskMeta(s));
      },
      setStep1BananaImageModel: (v) => {
        set({ step1BananaImageModel: v });
        const s = get();
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s.activeTaskId, pickTaskMeta(s));
      },
      setStep2BananaImageModel: (v) => {
        set({ step2BananaImageModel: v });
        const s = get();
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s.activeTaskId, pickTaskMeta(s));
      },
      setStep1ExpansionStrength: (v) => {
        set({ step1ExpansionStrength: v });
        const s = get();
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s.activeTaskId, pickTaskMeta(s));
      },
      setStep1FastMode: (v) => {
        set({ step1FastMode: !!v });
        const s = get();
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s.activeTaskId, pickTaskMeta(s));
      },
      setStep2FastMode: (v) => {
        set({ step2FastMode: !!v });
        const s = get();
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s.activeTaskId, pickTaskMeta(s));
      },
      addStep1ReferenceImage: (dataUrl) => {
        const s = get();
        if (s.step1ReferenceImageDataUrls.length >= 5) return false;
        set({ step1ReferenceImageDataUrls: [...s.step1ReferenceImageDataUrls, dataUrl] });
        return true;
      },
      removeStep1ReferenceImageAt: (index) =>
        set((state) => ({
          step1ReferenceImageDataUrls: state.step1ReferenceImageDataUrls.filter((_, i) => i !== index),
        })),
      clearStep1ReferenceImages: () => set({ step1ReferenceImageDataUrls: [] }),

      resetAll: () => {
        const s = get();
        const id = s.activeTaskId;
        flushDebouncedTaskMetaSave();
        clearTaskPromptBackup(id);
        void saveTaskToIdb(id, {
          meta: defaultTaskWorkspaceMeta(),
          mainImages: [],
          mainHistoryImages: [],
          galleryImages: [],
          galleryHistoryImages: [],
        }).catch(() => undefined);

        const now = new Date().toISOString();
        set({
          provider: "nano-banana-pro",
          prompt: "",
          count: 1,
          step1BananaImageModel: "banana-pro",
          step2BananaImageModel: "banana-pro",
          step1ExpansionStrength: "standard",
          step1FastMode: false,
          step2FastMode: false,
          step1ReferenceImageDataUrls: [],
          mainImages: [],
          mainHistoryImages: [],
          selectedMainImageId: null,
          selectedMainImageUrl: null,
          selectedMainImageIds: [],
          galleryImages: [],
          galleryHistoryImages: [],
          copywriting: emptyCopywriting,
          status: idleGeneratorStatus(),
          error: null,
          lastTextModelUsed: null,
          lastImageCountPassed: null,
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, updatedAt: now, searchLine: "", lastSuccessPrompt: "" }
              : t
          ),
        });
      },

      syncTasksFromServer: async () => {
        try {
          const tasks = await fetchServerTasks();
          if (!tasks.length) return;
          const s = get();
          const serverIds = new Set(tasks.map((t) => t.id));
          const serverTasks: GeneratorTask[] = tasks.map((t) => ({
            id: t.id,
            name: t.name,
            searchLine: t.searchLine,
            isProtected: t.isProtected,
            sortOrder: t.sortOrder,
            currentStep: t.currentStep,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            lastSuccessPrompt: s.tasks.find((x) => x.id === t.id)?.lastSuccessPrompt,
          }));
          // 保留仅本地任务：数据库不可用期间生成的本地工作区不应被云端空列表覆盖。
          const localOnlyTasks = s.tasks
            .filter((t) => !serverIds.has(t.id))
            .map((t, index) => ({
              ...t,
              sortOrder:
                typeof t.sortOrder === "number"
                  ? t.sortOrder
                  : tasks.length + index,
            }));
          const mergedTasks = [...serverTasks, ...localOnlyTasks].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
          );
          const activeTaskId = mergedTasks.some((t) => t.id === s.activeTaskId)
            ? s.activeTaskId
            : mergedTasks[0]?.id ?? s.activeTaskId;
          set({
            tasks: mergedTasks,
            activeTaskId,
          });
        } catch {
          /* keep local fallback */
        }
      },

      syncActiveTaskWorkspaceFromServer: async () => {
        const s = get();
        if (s.status.step1Generating || s.status.step3Generating || s.status.step4Generating) return;
        const taskId = s.activeTaskId;
        let loaded = await loadTaskFromIdb(taskId);
        const serverWorkspace = await fetchTaskWorkspaceFromServer(taskId);
        if (!serverWorkspace) return;
        loaded = mergeTaskWorkspaceWithServer(loaded, serverWorkspace);
        const targetTask = get().tasks.find((t) => t.id === taskId);
        const promptForTask =
          loaded.meta.prompt.trim() ||
          (targetTask?.lastSuccessPrompt?.trim() ?? "") ||
          readTaskPromptBackup(taskId).trim() ||
          "";
        flushTaskPromptBackup(taskId, promptForTask);
        const mainIdSet = new Set([
          ...loaded.mainImages.map((m) => m.id),
          ...loaded.mainHistoryImages.map((m) => m.id),
        ]);
        let selectedMainImageId = loaded.meta.selectedMainImageId;
        let selectedMainImageIds = loaded.meta.selectedMainImageIds.filter((id) => mainIdSet.has(id));
        if (selectedMainImageId && !mainIdSet.has(selectedMainImageId)) {
          selectedMainImageId = loaded.mainImages[0]?.id ?? loaded.mainHistoryImages[0]?.id ?? null;
        }
        if (!selectedMainImageIds.length && selectedMainImageId) {
          selectedMainImageIds = [selectedMainImageId];
        }
        const primaryImg = selectedMainImageId
          ? loaded.mainImages.find((x) => x.id === selectedMainImageId) ??
            loaded.mainHistoryImages.find((x) => x.id === selectedMainImageId)
          : null;
        set({
          provider: loaded.meta.provider,
          prompt: promptForTask || loaded.meta.prompt,
          count: clampCount(loaded.meta.count),
          step1BananaImageModel: resolvedStep1BananaImageModel(loaded.meta),
          step2BananaImageModel: resolvedStep2BananaImageModel(loaded.meta),
          step1ExpansionStrength: loaded.meta.step1ExpansionStrength,
          step1FastMode: loaded.meta.step1FastMode,
          step2FastMode: loaded.meta.step2FastMode,
          selectedMainImageId,
          selectedMainImageUrl: primaryImg?.url ?? null,
          selectedMainImageIds,
          copywriting: loaded.meta.copywriting,
          lastTextModelUsed: loaded.meta.lastTextModelUsed,
          lastImageCountPassed: loaded.meta.lastImageCountPassed,
          mainImages: loaded.mainImages,
          mainHistoryImages: loaded.mainHistoryImages,
          galleryImages: loaded.galleryImages,
          galleryHistoryImages: loaded.galleryHistoryImages,
          step1ReferenceImageDataUrls: [],
          error: null,
        });
        void saveTaskToIdb(taskId, {
          meta: {
            ...loaded.meta,
            prompt: promptForTask || loaded.meta.prompt,
            selectedMainImageId,
            selectedMainImageUrl: primaryImg?.url ?? null,
            selectedMainImageIds,
          },
          mainImages: loaded.mainImages,
          mainHistoryImages: loaded.mainHistoryImages,
          galleryImages: loaded.galleryImages,
          galleryHistoryImages: loaded.galleryHistoryImages,
        }).catch(() => undefined);
      },

      createNewTask: async (name) => {
        const s = get();
        if (s.status.step1Generating || s.status.step3Generating || s.status.step4Generating) {
          set({ error: "生成中无法新建任务，请等待完成。" });
          return;
        }
        flushDebouncedTaskMetaSave();
        flushTaskPromptBackup(s.activeTaskId, s.prompt);
        try {
          await persistActiveWorkspace(s);
        } catch {
          /* ignore */
        }
        const taskName = (name?.trim() || `新任务 ${s.tasks.length + 1}`).slice(0, 80);
        let createdServerTaskId: string | null = null;
        try {
          const res = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: taskName }),
          });
          if (res.ok) {
            const data = (await res.json().catch(() => ({}))) as { task?: { id?: string } };
            createdServerTaskId = typeof data.task?.id === "string" ? data.task.id : null;
          }
        } catch {
          /* keep local fallback */
        }
        const now = new Date().toISOString();
        const id = createdServerTaskId ?? newTaskId();
        set({
          tasks: [
            ...s.tasks.map((t) =>
              t.id === s.activeTaskId ? { ...t, updatedAt: now } : t
            ),
            {
              id,
              name: taskName,
              sortOrder: s.tasks.length,
              currentStep: "STEP1",
              createdAt: now,
              updatedAt: now,
              searchLine: "",
              isProtected: false,
            },
          ],
          activeTaskId: id,
          status: idleGeneratorStatus(),
          provider: "nano-banana-pro",
          prompt: "",
          count: 1,
          step1BananaImageModel: "banana-pro",
          step2BananaImageModel: "banana-pro",
          step1ExpansionStrength: "standard",
          step1FastMode: false,
          step2FastMode: false,
          step1ReferenceImageDataUrls: [],
          mainImages: [],
          mainHistoryImages: [],
          selectedMainImageId: null,
          selectedMainImageUrl: null,
          selectedMainImageIds: [],
          galleryImages: [],
          galleryHistoryImages: [],
          copywriting: emptyCopywriting,
          error: null,
          lastTextModelUsed: null,
          lastImageCountPassed: null,
        });
        void persistActiveWorkspace(get()).catch(() => undefined);
      },

      switchTask: async (taskId) => {
        const s = get();
        if (taskId === s.activeTaskId) return;
        if (s.status.step1Generating || s.status.step3Generating || s.status.step4Generating) {
          set({ error: "生成中无法切换任务，请等待完成。" });
          return;
        }
        if (!s.tasks.some((t) => t.id === taskId)) return;

        flushDebouncedTaskMetaSave();
        flushTaskPromptBackup(s.activeTaskId, s.prompt);
        try {
          await persistActiveWorkspace(s);
        } catch {
          /* ignore */
        }

        let loaded = await loadTaskFromIdb(taskId);
        const serverWorkspace = await fetchTaskWorkspaceFromServer(taskId);
        loaded = mergeTaskWorkspaceWithServer(loaded, serverWorkspace);
        const targetTask = s.tasks.find((t) => t.id === taskId);
        const promptForTask =
          loaded.meta.prompt.trim() ||
          (targetTask?.lastSuccessPrompt?.trim() ?? "") ||
          readTaskPromptBackup(taskId).trim() ||
          "";
        flushTaskPromptBackup(taskId, promptForTask);
        const mainIdSet = new Set([
          ...loaded.mainImages.map((m) => m.id),
          ...loaded.mainHistoryImages.map((m) => m.id),
        ]);
        let selectedMainImageId = loaded.meta.selectedMainImageId;
        let selectedMainImageIds = loaded.meta.selectedMainImageIds.filter((id) => mainIdSet.has(id));
        if (selectedMainImageId && !mainIdSet.has(selectedMainImageId)) {
          selectedMainImageId =
            loaded.mainImages[0]?.id ?? loaded.mainHistoryImages[0]?.id ?? null;
        }
        if (!selectedMainImageIds.length && selectedMainImageId) {
          selectedMainImageIds = [selectedMainImageId];
        }
        const primaryImg = selectedMainImageId
          ? loaded.mainImages.find((x) => x.id === selectedMainImageId) ??
            loaded.mainHistoryImages.find((x) => x.id === selectedMainImageId)
          : null;
        const now = new Date().toISOString();
        set({
          activeTaskId: taskId,
          status: idleGeneratorStatus(),
          provider: loaded.meta.provider,
          prompt: promptForTask,
          count: clampCount(loaded.meta.count),
          step1BananaImageModel: resolvedStep1BananaImageModel(loaded.meta),
          step2BananaImageModel: resolvedStep2BananaImageModel(loaded.meta),
          step1ExpansionStrength: loaded.meta.step1ExpansionStrength,
          step1FastMode: loaded.meta.step1FastMode,
          step2FastMode: loaded.meta.step2FastMode,
          selectedMainImageId,
          selectedMainImageUrl: primaryImg?.url ?? null,
          selectedMainImageIds,
          copywriting: loaded.meta.copywriting,
          lastTextModelUsed: loaded.meta.lastTextModelUsed,
          lastImageCountPassed: loaded.meta.lastImageCountPassed,
          mainImages: loaded.mainImages,
          mainHistoryImages: loaded.mainHistoryImages,
          galleryImages: loaded.galleryImages,
          galleryHistoryImages: loaded.galleryHistoryImages,
          step1ReferenceImageDataUrls: [],
          error: null,
          tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, updatedAt: now } : t)),
        });
        void saveTaskToIdb(taskId, {
          meta: {
            ...loaded.meta,
            prompt: promptForTask,
            selectedMainImageId,
            selectedMainImageUrl: primaryImg?.url ?? null,
            selectedMainImageIds,
          },
          mainImages: loaded.mainImages,
          mainHistoryImages: loaded.mainHistoryImages,
          galleryImages: loaded.galleryImages,
          galleryHistoryImages: loaded.galleryHistoryImages,
        }).catch(() => undefined);
      },

      renameTask: (taskId, name) => {
        const trimmed = name.trim().slice(0, 80);
        if (!trimmed) return;
        const now = new Date().toISOString();
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId ? { ...t, name: trimmed, updatedAt: now } : t
          ),
        }));
        void fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, name: trimmed }),
        }).catch(() => undefined);
      },

      setTaskProtected: (taskId, isProtected) => {
        const now = new Date().toISOString();
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId ? { ...t, isProtected, updatedAt: now } : t
          ),
          error: null,
        }));
        void fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, isProtected }),
        }).catch(() => undefined);
      },

      deleteTask: async (taskId) => {
        const s = get();
        if (s.tasks.find((t) => t.id === taskId)?.isProtected) {
          set({ error: "该任务已开启保护，无法删除。请先取消保护。" });
          return;
        }
        if (s.tasks.length <= 1) {
          set({ error: "至少保留一个任务。" });
          return;
        }
        if (
          s.activeTaskId === taskId &&
          (s.status.step1Generating || s.status.step3Generating || s.status.step4Generating)
        ) {
          set({ error: "生成中无法删除当前任务。" });
          return;
        }

        const nextTasks = s.tasks.filter((t) => t.id !== taskId);
        await deleteTaskFromIdb(taskId).catch(() => undefined);
        clearTaskPromptBackup(taskId);
        void fetch(`/api/tasks?taskId=${encodeURIComponent(taskId)}`, { method: "DELETE" }).catch(() => undefined);

        if (s.activeTaskId !== taskId) {
          set({ tasks: nextTasks, error: null });
          return;
        }

        flushDebouncedTaskMetaSave();
        const nextId = nextTasks[0].id;
        let loaded = await loadTaskFromIdb(nextId);
        const serverWorkspace = await fetchTaskWorkspaceFromServer(nextId);
        loaded = mergeTaskWorkspaceWithServer(loaded, serverWorkspace);
        const promptForNext = loaded.meta.prompt.trim() || readTaskPromptBackup(nextId).trim() || "";
        flushTaskPromptBackup(nextId, promptForNext);
        const mainIdSet = new Set([
          ...loaded.mainImages.map((m) => m.id),
          ...loaded.mainHistoryImages.map((m) => m.id),
        ]);
        let selectedMainImageId = loaded.meta.selectedMainImageId;
        let selectedMainImageIds = loaded.meta.selectedMainImageIds.filter((id) => mainIdSet.has(id));
        if (selectedMainImageId && !mainIdSet.has(selectedMainImageId)) {
          selectedMainImageId =
            loaded.mainImages[0]?.id ?? loaded.mainHistoryImages[0]?.id ?? null;
        }
        if (!selectedMainImageIds.length && selectedMainImageId) {
          selectedMainImageIds = [selectedMainImageId];
        }
        const primaryImg = selectedMainImageId
          ? loaded.mainImages.find((x) => x.id === selectedMainImageId) ??
            loaded.mainHistoryImages.find((x) => x.id === selectedMainImageId)
          : null;
        const now = new Date().toISOString();
        set({
          tasks: nextTasks.map((t) => (t.id === nextId ? { ...t, updatedAt: now } : t)),
          activeTaskId: nextId,
          status: idleGeneratorStatus(),
          provider: loaded.meta.provider,
          prompt: promptForNext || loaded.meta.prompt,
          count: clampCount(loaded.meta.count),
          step1BananaImageModel: resolvedStep1BananaImageModel(loaded.meta),
          step2BananaImageModel: resolvedStep2BananaImageModel(loaded.meta),
          step1ExpansionStrength: loaded.meta.step1ExpansionStrength,
          step1FastMode: loaded.meta.step1FastMode,
          step2FastMode: loaded.meta.step2FastMode,
          selectedMainImageId,
          selectedMainImageUrl: primaryImg?.url ?? null,
          selectedMainImageIds,
          copywriting: loaded.meta.copywriting,
          lastTextModelUsed: loaded.meta.lastTextModelUsed,
          lastImageCountPassed: loaded.meta.lastImageCountPassed,
          mainImages: loaded.mainImages,
          mainHistoryImages: loaded.mainHistoryImages,
          galleryImages: loaded.galleryImages,
          galleryHistoryImages: loaded.galleryHistoryImages,
          step1ReferenceImageDataUrls: [],
          error: null,
        });
        void saveTaskToIdb(nextId, {
          meta: {
            ...loaded.meta,
            prompt: promptForNext || loaded.meta.prompt,
            selectedMainImageId,
            selectedMainImageUrl: primaryImg?.url ?? null,
            selectedMainImageIds,
          },
          mainImages: loaded.mainImages,
          mainHistoryImages: loaded.mainHistoryImages,
          galleryImages: loaded.galleryImages,
          galleryHistoryImages: loaded.galleryHistoryImages,
        }).catch(() => undefined);
      },

      reorderTasks: (draggedId, targetId) => {
        if (draggedId === targetId) return;
        set((state) => {
          const fromIdx = state.tasks.findIndex((t) => t.id === draggedId);
          const toIdx = state.tasks.findIndex((t) => t.id === targetId);
          if (fromIdx < 0 || toIdx < 0) return state;
          const next = [...state.tasks];
          const [removed] = next.splice(fromIdx, 1);
          let insertAt = toIdx;
          if (fromIdx < toIdx) insertAt = toIdx - 1;
          next.splice(insertAt, 0, removed);
          next.forEach((t, idx) => {
            void fetch("/api/tasks", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskId: t.id, sortOrder: idx }),
            }).catch(() => undefined);
          });
          return { tasks: next };
        });
      },

      selectMainImage: (id) => {
        const state = get();
        const found =
          state.mainImages.find((x) => x.id === id) ??
          state.mainHistoryImages.find((x) => x.id === id);

        set({
          selectedMainImageIds: [id],
          selectedMainImageId: id,
          selectedMainImageUrl: found?.url ?? null,
          // 不要在 Step2 选择时提前展示 Step3 结果；直到用户点击生成。
          galleryImages: [],
          // 切换主图/集合后，Step4 文案需要重新生成
          copywriting: emptyCopywriting,
          error: null,
        });
        const s2 = get();
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s2.activeTaskId, pickTaskMeta(s2));
      },

      toggleMainImageSelection: (id) => {
        set((s) => {
          const exists = s.selectedMainImageIds.includes(id);
          const nextIds = exists
            ? s.selectedMainImageIds.filter((x) => x !== id)
            : [id, ...s.selectedMainImageIds];

          const primaryId = nextIds[0] ?? null;
          const primary = primaryId
            ? (s.mainImages.find((x) => x.id === primaryId) ??
                s.mainHistoryImages.find((x) => x.id === primaryId))
            : null;
          return {
            selectedMainImageIds: nextIds,
            selectedMainImageId: primaryId,
            selectedMainImageUrl: primary?.url ?? null,
            // Step2 选中变化时不展示 Step3 旧结果；只在“生成展示图组合”后填充。
            galleryImages: [],
            // 切换选择集后，避免 Step4 误用旧文案
            copywriting: emptyCopywriting,
            error: null,
          };
        });
        const s2 = get();
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s2.activeTaskId, pickTaskMeta(s2));
      },

      setMainImageSelection: (ids) => {
        set((s) => {
          const nextIds = Array.from(new Set(ids));
          const primaryId = nextIds[0] ?? null;
          const primary =
            primaryId
              ? s.mainImages.find((x) => x.id === primaryId) ??
                s.mainHistoryImages.find((x) => x.id === primaryId)
              : null;
          return {
            selectedMainImageIds: nextIds,
            selectedMainImageId: primaryId,
            selectedMainImageUrl: primary?.url ?? null,
            // Step2 批量选择变化时不提前展示 Step3 结果。
            galleryImages: [],
            copywriting: emptyCopywriting,
            error: null,
          };
        });
        const s2 = get();
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s2.activeTaskId, pickTaskMeta(s2));
      },

      generateMainImages: async () => {
        const {
          prompt,
          count,
          provider,
          activeTaskId,
          step1BananaImageModel,
          step1ExpansionStrength,
          step1FastMode,
          step1ReferenceImageDataUrls,
        } = get();

        if (!prompt.trim()) {
          set({ error: "请先填写设计提示词（Prompt）。" });
          return false;
        }

        const prevMain = get().mainImages;
        const prevHist = get().mainHistoryImages;
        const histIdSet = new Set(prevHist.map((x) => x.id));
        // 仅归档「尚未写入历史」的当前主图，避免与成功回调里写入的历史重复
        const archiveBatch = prevMain.filter((x) => !histIdSet.has(x.id));
        step1RecoverPreMainIdSet = new Set([
          ...prevMain.map((x) => x.id),
          ...prevHist.map((x) => x.id),
        ]);

        set({
          error: null,
          status: withStep1Generating(get().status, true),
          mainHistoryImages: [...archiveBatch, ...prevHist],
          mainImages: [],
          selectedMainImageId: null,
          selectedMainImageUrl: null,
          selectedMainImageIds: [],
          galleryImages: [],
          copywriting: emptyCopywriting,
        });

        try {
          const { referenceImageDataUrls, cappyCalmLockPreset } =
            await resolveCappyCalmStep1ReferenceDataUrls(prompt, step1ReferenceImageDataUrls);
          // 约定返回：
          // { images: [{ id, url, createdAt? }, ...] }
          const res = await fetch("/api/generate-main", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              taskId: activeTaskId,
              count,
              provider,
              bananaImageModel: step1BananaImageModel,
              fastMode: step1FastMode,
              expansionStrength: step1ExpansionStrength,
              ...(referenceImageDataUrls.length ? { referenceImageDataUrls } : {}),
              ...(cappyCalmLockPreset ? { cappyCalmLockPreset } : {}),
            }),
          });

          if (!res.ok) {
            const data = (await res.json().catch(() => null)) as ApiError | null;
            throw new Error(data?.message || `生成失败（HTTP ${res.status}）`);
          }

          const data = (await res.json()) as {
            images: MainImage[];
            debugPromptZh?: string;
            warning?: string;
          };
          const images = (data.images ?? []).map((img) => ({
            ...img,
            debugPromptZh: img.debugPromptZh ?? data.debugPromptZh,
          }));
          const first = images[0];

          const now = new Date().toISOString();
          const st = get();
          const line = prompt.trim().slice(0, 160);
          const incomingIds = new Set(images.map((x) => x.id));
          const historyWithoutIncoming = st.mainHistoryImages.filter((h) => !incomingIds.has(h.id));
          set({
            mainImages: images,
            // 每次 Step1 成功生图都写入 Step2 历史（不论是否再去 Step2 加工）
            mainHistoryImages: [...images, ...historyWithoutIncoming],
            selectedMainImageId: first?.id ?? null,
            selectedMainImageUrl: first?.url ?? null,
            selectedMainImageIds: first?.id ? [first.id] : [],
            status: withStep1Generating(st.status, false),
            error: typeof data.warning === "string" ? data.warning : null,
            tasks: st.tasks.map((t) =>
              t.id === st.activeTaskId
                ? {
                    ...t,
                    updatedAt: now,
                    currentStep: "STEP2",
                    searchLine: line || t.searchLine,
                    lastSuccessPrompt: prompt.trim() || t.lastSuccessPrompt,
                  }
                : t
            ),
          });
          void fetch("/api/tasks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: st.activeTaskId, currentStep: "STEP2", searchLine: line }),
          }).catch(() => undefined);
          const stAfter = get();
          // 必须在 hydration 完成前也落盘：否则用户很快生图并刷新时 meta.prompt 从未写入，刷新后输入框为空。
          flushDebouncedTaskMetaSave();
          try {
            await persistActiveWorkspace(stAfter);
          } catch (err) {
            console.warn("[GemMuse] persistActiveWorkspace failed after Step1 generate", err);
          }
          flushTaskPromptBackup(stAfter.activeTaskId, stAfter.prompt);
          step1RecoverPreMainIdSet = null;
          return images.length > 0;
        } catch (e) {
          const mid = get();
          // 轮询 recover 可能已先合并服务端结果并结束 generating；此时勿用失败态覆盖已有主图。
          if (!mid.status.step1Generating && mid.mainImages.length > 0) {
            step1RecoverPreMainIdSet = null;
            return true;
          }
          const message = friendlyFetchErrorMessage(e);
          set({
            status: withStep1Generating(get().status, false),
            error: message || "生成创意时发生错误。",
          });
          const stErr = get();
          flushDebouncedTaskMetaSave();
          try {
            await persistActiveWorkspace(stErr);
          } catch (err) {
            console.warn("[GemMuse] persistActiveWorkspace failed after Step1 error", err);
          }
          step1RecoverPreMainIdSet = null;
          return false;
        }
      },

      recoverStep1FromServerIfComplete: async () => {
        const s = get();
        if (!s.status.step1Generating || !step1RecoverPreMainIdSet) return false;
        const taskId = s.activeTaskId;
        const preSet = step1RecoverPreMainIdSet;
        let loaded = await loadTaskFromIdb(taskId);
        const serverWorkspace = await fetchTaskWorkspaceFromServer(taskId);
        if (!serverWorkspace?.images?.length) return false;
        loaded = mergeTaskWorkspaceWithServer(loaded, serverWorkspace);
        const newMains = loaded.mainHistoryImages.filter((m) => !preSet.has(m.id));
        if (!newMains.length) return false;
        const batch = pickLatestMainTimeCluster(newMains, s.count);
        if (!batch.length) return false;

        const prompt = s.prompt;
        const line = prompt.trim().slice(0, 160);
        const incomingIds = new Set(batch.map((x) => x.id));
        const historyWithoutIncoming = loaded.mainHistoryImages.filter((h) => !incomingIds.has(h.id));
        const first = batch[0];
        const now = new Date().toISOString();
        set({
          mainImages: batch,
          mainHistoryImages: [...batch, ...historyWithoutIncoming],
          selectedMainImageId: first?.id ?? null,
          selectedMainImageUrl: first?.url ?? null,
          selectedMainImageIds: first?.id ? [first.id] : [],
          status: withStep1Generating(s.status, false),
          error: null,
          tasks: s.tasks.map((t) =>
            t.id === s.activeTaskId
              ? {
                  ...t,
                  updatedAt: now,
                  currentStep: "STEP2",
                  searchLine: line || t.searchLine,
                  lastSuccessPrompt: prompt.trim() || t.lastSuccessPrompt,
                }
              : t
          ),
        });
        step1RecoverPreMainIdSet = null;
        void fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: s.activeTaskId, currentStep: "STEP2", searchLine: line }),
        }).catch(() => undefined);
        const stAfter = get();
        flushDebouncedTaskMetaSave();
        try {
          await persistActiveWorkspace(stAfter);
        } catch (err) {
          console.warn("[GemMuse] persistActiveWorkspace failed after Step1 recover", err);
        }
        flushTaskPromptBackup(stAfter.activeTaskId, stAfter.prompt);
        return true;
      },

      regenerateMainImage: async (id) => {
        const {
          prompt,
          provider,
          activeTaskId,
          step2BananaImageModel,
          step1ExpansionStrength,
          step1FastMode,
          mainImages,
          step1ReferenceImageDataUrls,
        } = get();

        if (!prompt.trim()) {
          set({ error: "请先填写设计提示词（Prompt）。" });
          return;
        }

        const found = mainImages.find((x) => x.id === id);
        if (!found) return;

        set({
          error: null,
          status: withStep1Generating(get().status, true),
          // Step2 重新生成后，Step3/Step4 的内容可能不匹配，清空以免误导
          galleryImages: [],
          copywriting: emptyCopywriting,
        });

        try {
          const { referenceImageDataUrls, cappyCalmLockPreset } =
            await resolveCappyCalmStep1ReferenceDataUrls(prompt, step1ReferenceImageDataUrls);
          // 只生成 1 张并替换该 id
          const res = await fetch("/api/generate-main", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              taskId: activeTaskId,
              count: 1,
              provider,
              bananaImageModel: step2BananaImageModel,
              fastMode: step1FastMode,
              expansionStrength: step1ExpansionStrength,
              ...(referenceImageDataUrls.length ? { referenceImageDataUrls } : {}),
              ...(cappyCalmLockPreset ? { cappyCalmLockPreset } : {}),
            }),
          });

          if (!res.ok) {
            const data = (await res.json().catch(() => null)) as ApiError | null;
            throw new Error(data?.message || `刷新主图失败（HTTP ${res.status}）`);
          }

          const data = (await res.json()) as {
            images: MainImage[];
            debugPromptZh?: string;
            warning?: string;
          };
          const newImg = data.images?.[0]
            ? {
                ...data.images[0],
                debugPromptZh: data.images[0].debugPromptZh ?? data.debugPromptZh,
              }
            : undefined;
          if (!newImg) throw new Error("未返回新图片。");

          set((state) => {
            const idx = state.mainImages.findIndex((x) => x.id === id);
            if (idx < 0) return state;

            const oldImg = state.mainImages[idx];
            const nextMainImages = [...state.mainImages];
            nextMainImages[idx] = newImg;

            const shouldUpdateSelection = state.selectedMainImageIds.includes(id);
            const nextSelectedMainImageIds = shouldUpdateSelection
              ? state.selectedMainImageIds.map((x) => (x === id ? newImg.id : x))
              : state.selectedMainImageIds;

            const nextPrimaryId = nextSelectedMainImageIds[0] ?? null;
            const nextMainHistoryImages = oldImg
              ? [oldImg, ...state.mainHistoryImages]
              : state.mainHistoryImages;

            const primaryImg =
              nextPrimaryId
                ? nextMainImages.find((x) => x.id === nextPrimaryId) ??
                  nextMainHistoryImages.find((x) => x.id === nextPrimaryId)
                : undefined;

            const regenNow = new Date().toISOString();
            const regenLine = prompt.trim().slice(0, 160);

            return {
              mainImages: nextMainImages,
              mainHistoryImages: nextMainHistoryImages,
              selectedMainImageIds: nextSelectedMainImageIds,
              selectedMainImageId: nextPrimaryId,
              selectedMainImageUrl: primaryImg?.url ?? null,
              tasks: state.tasks.map((t) =>
                t.id === state.activeTaskId
                  ? {
                      ...t,
                      updatedAt: regenNow,
                      searchLine: regenLine || t.searchLine,
                      lastSuccessPrompt: prompt.trim() || t.lastSuccessPrompt,
                    }
                  : t
              ),
            };
          });

          set({
            status: withStep1Generating(get().status, false),
            error: typeof data.warning === "string" ? data.warning : null,
          });
          flushDebouncedTaskMetaSave();
          try {
            await persistActiveWorkspace(get());
          } catch {
            /* ignore */
          }
        } catch (e) {
          const message = friendlyFetchErrorMessage(e);
          set({
            status: withStep1Generating(get().status, false),
            error: message || "刷新主图失败。",
          });
          flushDebouncedTaskMetaSave();
          try {
            await persistActiveWorkspace(get());
          } catch {
            /* ignore */
          }
        }
      },

      replaceGalleryImages: (images) => set({ galleryImages: images }),
      addGalleryImages: (images) =>
        set((state) => ({
          galleryImages: [...state.galleryImages, ...images],
        })),
      clearGalleryImages: () => set({ galleryImages: [] }),

      setGallerySetAsCurrent: (setId) => {
        const images = get().galleryHistoryImages.filter((x) => x.setId === setId);
        set({
          galleryImages: images,
          // 切换 Step3 当前集合后，Step4 文案需要重新生成
          copywriting: emptyCopywriting,
          error: null,
        });
      },

      enhanceGalleryImages: async ({ onModel, left, right, rear, front }) => {
        const {
          provider,
          prompt,
          activeTaskId,
          step2FastMode,
          step2BananaImageModel,
          selectedMainImageIds,
          mainImages,
          mainHistoryImages,
        } = get();

        if (!selectedMainImageIds.length) {
          set({ error: "请先在 Step 2 选择至少一张主视图。" });
          return false;
        }
        if (!onModel && !left && !right && !rear && !front) {
          set({ error: "请至少选择一个生成选项：穿戴图/左侧/右侧/后视图/正视图。" });
          return false;
        }

        const setId = `set_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const setCreatedAt = new Date().toISOString();

        set({
          error: null,
          status: withStep3Generating(get().status, true),
          galleryImages: [],
          // Step3 重新生成后，Step4 文案需要重新生成
          copywriting: emptyCopywriting,
        });

        try {
          const selectedItems = selectedMainImageIds
            .map((id) => {
              const found =
                mainImages.find((x) => x.id === id) ??
                mainHistoryImages.find((x) => x.id === id);
              return found ? { id, url: found.url } : null;
            })
            .filter((x): x is { id: string; url: string } => !!x);

          if (!selectedItems.length) {
            set({
              error: "所选主视图 URL 缺失，请重新选择。",
              status: withStep3Generating(get().status, false),
            });
            return false;
          }

          const merged: GalleryImage[] = [];

          for (const item of selectedItems) {
            const res = await fetch("/api/enhance", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              taskId: activeTaskId,
              prompt,
              fastMode: step2FastMode,
              bananaImageModel: step2BananaImageModel,
              selectedMainImageId: item.id,
              selectedMainImageUrl: item.url,
              onModel,
              left,
              right,
              rear,
              front: !!front,
            }),
            });

            if (!res.ok) {
              const data = (await res.json().catch(() => null)) as ApiError | null;
              const serverMsg =
                typeof data?.message === "string" && data.message.trim()
                  ? data.message.trim()
                  : "";
              throw new Error(serverMsg || `增强失败（HTTP ${res.status}）`);
            }

            const data = (await res.json()) as { galleryImages: GalleryImage[] };
            const raw = data.galleryImages ?? [];
            const nextImages: GalleryImage[] = raw.map((img) => ({
              ...img,
              setId,
              setCreatedAt,
            }));
            merged.push(...nextImages);
          }

          set({
            galleryImages: merged,
            galleryHistoryImages: [...get().galleryHistoryImages, ...merged],
            status: withStep3Generating(get().status, false),
            error: null,
            tasks: get().tasks.map((t) =>
              t.id === get().activeTaskId ? { ...t, currentStep: "STEP3", updatedAt: new Date().toISOString() } : t
            ),
          });
          void fetch("/api/tasks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: get().activeTaskId, currentStep: "STEP3" }),
          }).catch(() => undefined);
          const stAfterStep3 = get();
          flushDebouncedTaskMetaSave();
          try {
            await persistActiveWorkspace(stAfterStep3);
          } catch (err) {
            console.warn("[GemMuse] persistActiveWorkspace failed after Step3 enhance", err);
          }
          flushTaskPromptBackup(stAfterStep3.activeTaskId, stAfterStep3.prompt);
          return merged.length > 0;
        } catch (e) {
          const message = friendlyFetchErrorMessage(e);
          set({
            status: withStep3Generating(get().status, false),
            error: message || "生成展示图时发生错误。",
          });
          return false;
        }
      },

      regenerateGalleryImage: async (imageId) => {
        const {
          provider,
          prompt,
          activeTaskId,
          step1FastMode,
          step2FastMode,
          step2BananaImageModel,
          step1ExpansionStrength,
          mainImages,
          mainHistoryImages,
          galleryImages,
          galleryHistoryImages,
          step1ReferenceImageDataUrls,
        } = get();

        const found =
          galleryImages.find((x) => x.id === imageId) ??
          galleryHistoryImages.find((x) => x.id === imageId);

        if (!found) return;

        if (!prompt.trim()) {
          set({ error: "请先填写设计提示词（Prompt）。" });
          return;
        }

        const { type: targetType, sourceMainImageId } = found;
        const setId = `set_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const setCreatedAt = new Date().toISOString();

        set({
          error: null,
          status: withStep3Generating(get().status, true),
          // Step3 更新后，Step4 文案需要重新生成
          copywriting: emptyCopywriting,
        });

        try {
          const allGallery = [...galleryImages, ...galleryHistoryImages];

          const setScopeImages = found.setId
            ? allGallery.filter((x) => x.setId === found.setId && x.sourceMainImageId === sourceMainImageId)
            : allGallery.filter((x) => x.sourceMainImageId === sourceMainImageId);

          const getMainInputUrlFromSet = () => {
            const main = setScopeImages.find((x) => x.type === "main");
            if (main?.url) return main.url;
            const current = mainImages.find((x) => x.id === sourceMainImageId) ?? mainHistoryImages.find((x) => x.id === sourceMainImageId);
            return current?.url ?? null;
          };

          const mainInputUrl = getMainInputUrlFromSet();
          if (!mainInputUrl && targetType !== "main") {
            throw new Error("缺少主视图 URL，无法刷新该展示图。");
          }

          let nextImages: GalleryImage[] = [];

          if (targetType === "main") {
            const oldMain =
              mainImages.find((x) => x.id === sourceMainImageId) ??
              mainHistoryImages.find((x) => x.id === sourceMainImageId);
            if (!oldMain) throw new Error("缺少主视图，无法刷新 main。");

            const { referenceImageDataUrls, cappyCalmLockPreset } =
              await resolveCappyCalmStep1ReferenceDataUrls(prompt, step1ReferenceImageDataUrls);
            const res = await fetch("/api/generate-main", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt,
                taskId: activeTaskId,
                count: 1,
                provider,
                bananaImageModel: step2BananaImageModel,
                fastMode: step1FastMode,
                expansionStrength: step1ExpansionStrength,
                ...(referenceImageDataUrls.length ? { referenceImageDataUrls } : {}),
                ...(cappyCalmLockPreset ? { cappyCalmLockPreset } : {}),
              }),
            });

            if (!res.ok) {
              const data = (await res.json().catch(() => null)) as ApiError | null;
              throw new Error(data?.message || `刷新主图失败（HTTP ${res.status}）`);
            }

            const data = (await res.json()) as { images: MainImage[]; debugPromptZh?: string };
            const newMain = data.images?.[0]
              ? { ...data.images[0], debugPromptZh: data.debugPromptZh }
              : undefined;
            if (!newMain?.url) throw new Error("未返回新的主图 URL。");

            // 生成逻辑：main 刷新后，若该 set 当时也生成了其他视角，则同步刷新对应视角。
            const onModel = setScopeImages.some((x) => x.type === "on_model");
            const left = setScopeImages.some((x) => x.type === "left" || x.type === "side");
            const right = setScopeImages.some((x) => x.type === "right");
            const rear = setScopeImages.some((x) => x.type === "rear");
            const front = setScopeImages.some((x) => x.type === "front" || x.type === "top");

            // 更新 Step2 主图 URL（保持 id 不变，避免 Step2/历史过滤逻辑串掉）
            set((state) => {
              const idx = state.mainImages.findIndex((x) => x.id === sourceMainImageId);
              const nextMainImages =
                idx >= 0
                  ? state.mainImages.map((x) =>
                      x.id === sourceMainImageId ? { ...x, url: newMain.url, debugPromptZh: newMain.debugPromptZh } : x
                    )
                  : state.mainImages;

              const shouldUpdateSelection = state.selectedMainImageIds.includes(sourceMainImageId);
              return {
                mainImages: nextMainImages,
                selectedMainImageUrl: shouldUpdateSelection ? newMain.url : state.selectedMainImageUrl,
              };
            });

            if (onModel || left || right || rear || front) {
              const enhanceRes = await fetch("/api/enhance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  provider,
                  taskId: activeTaskId,
                  prompt,
                  fastMode: step2FastMode,
                  bananaImageModel: step2BananaImageModel,
                  selectedMainImageId: sourceMainImageId,
                  selectedMainImageUrl: newMain.url,
                  onModel,
                  left,
                  right,
                  rear,
                  front,
                }),
              });

              if (!enhanceRes.ok) {
                const data = (await enhanceRes.json().catch(() => null)) as ApiError | null;
                const serverMsg =
                  typeof data?.message === "string" && data.message.trim()
                    ? data.message.trim()
                    : "";
                throw new Error(serverMsg || `刷新展示图失败（HTTP ${enhanceRes.status}）`);
              }

              const enhanceData = (await enhanceRes.json()) as { galleryImages: GalleryImage[] };
              const raw = enhanceData.galleryImages ?? [];
              nextImages = raw.map((img) => ({ ...img, setId, setCreatedAt }));
            } else {
              const fallbackNonce = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
              nextImages = [
                {
                  id: `gallery_main_${sourceMainImageId}_${fallbackNonce}`,
                  type: "main",
                  url: newMain.url,
                  sourceMainImageId,
                  createdAt: new Date().toISOString(),
                  setId,
                  setCreatedAt,
                },
              ];
            }
          } else {
            const onModel = targetType === "on_model";
            const left = targetType === "left" || targetType === "side";
            const right = targetType === "right";
            const rear = targetType === "rear";
            const front = targetType === "front" || targetType === "top";

            const res = await fetch("/api/enhance", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider,
                taskId: activeTaskId,
                prompt,
                fastMode: step2FastMode,
                bananaImageModel: step2BananaImageModel,
                selectedMainImageId: sourceMainImageId,
                selectedMainImageUrl: mainInputUrl ?? "",
                onModel,
                left,
                right,
                rear,
                front,
              }),
            });

            if (!res.ok) {
              const data = (await res.json().catch(() => null)) as ApiError | null;
              const serverMsg =
                typeof data?.message === "string" && data.message.trim()
                  ? data.message.trim()
                  : "";
              throw new Error(serverMsg || `刷新展示图失败（HTTP ${res.status}）`);
            }

            const data = (await res.json()) as { galleryImages: GalleryImage[] };
            const raw = data.galleryImages ?? [];
            nextImages = raw
              .map((img) => ({ ...img, setId, setCreatedAt }))
              .filter((img) => img.type !== "main")
              .map((img) => {
                if (targetType === "side" && img.type === "left") {
                  return { ...img, id: found.id, type: "side" as const };
                }
                if (targetType === "top" && img.type === "front") {
                  return { ...img, id: found.id, type: "top" as const };
                }
                return img;
              });
          }

          if (!nextImages.length) return;

          set((state) => {
            // 用新的图片替换当前 galleryImages 中对应 type/sourceMainImageId 的版本；
            // 若当前 galleryImages 没有该版本，则补上，保证 Step3 立即可见。
            const updatedGallery = [...state.galleryImages];

            for (const n of nextImages) {
              const idx = updatedGallery.findIndex(
                (x) => x.sourceMainImageId === n.sourceMainImageId && x.type === n.type
              );
              if (idx >= 0) updatedGallery[idx] = n;
              else updatedGallery.push(n);
            }

            return {
              galleryImages: updatedGallery,
              galleryHistoryImages: [...state.galleryHistoryImages, ...nextImages],
            };
          });

          set({ status: withStep3Generating(get().status, false), error: null });
        } catch (e) {
          const message = friendlyFetchErrorMessage(e);
          set({
            status: withStep3Generating(get().status, false),
            error: message || "刷新展示图时发生错误。",
          });
        }
      },

      toggleMainHistoryFavorite: (id) => {
        set((state) => ({
          mainHistoryImages: state.mainHistoryImages.map((x) =>
            x.id === id ? { ...x, isFavorite: !x.isFavorite } : x
          ),
          mainImages: state.mainImages.map((x) =>
            x.id === id ? { ...x, isFavorite: !x.isFavorite } : x
          ),
        }));
      },

      toggleGalleryHistoryFavoriteBySelector: (selector) => {
        const targetKey = galleryImageSelectorKey(selector);
        set((state) => ({
          galleryHistoryImages: state.galleryHistoryImages.map((x) =>
            galleryImageSelectorKey(x) === targetKey ? { ...x, isFavorite: !x.isFavorite } : x
          ),
          galleryImages: state.galleryImages.map((x) =>
            galleryImageSelectorKey(x) === targetKey ? { ...x, isFavorite: !x.isFavorite } : x
          ),
        }));
      },

      deleteMainHistoryImagesByIds: async (ids) => {
        const idSet = new Set(ids);
        const snapshot = get();
        const serverDeleteIds = ids.filter((id) => {
          const m =
            snapshot.mainHistoryImages.find((x) => x.id === id) ??
            snapshot.mainImages.find((x) => x.id === id);
          return !!m && !m.isFavorite;
        });

        if (serverDeleteIds.length) {
          try {
            const res = await fetch(
              `/api/tasks/${encodeURIComponent(snapshot.activeTaskId)}/workspace/images`,
              {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: serverDeleteIds }),
              }
            );
            if (!res.ok) {
              const data = (await res.json().catch(() => ({}))) as { message?: string };
              set({
                error:
                  typeof data.message === "string"
                    ? data.message
                    : "云端删除主图失败，刷新后仍可能出现已删图片，请稍后再试。",
              });
              return false;
            }
          } catch {
            set({ error: "云端删除主图失败，请检查网络后重试。" });
            return false;
          }
        }

        set((state) => {
          const nextMainHistoryImages = state.mainHistoryImages.filter(
            (x) => x.isFavorite || !idSet.has(x.id)
          );
          const nextMainImages = state.mainImages.filter(
            (x) => x.isFavorite || !idSet.has(x.id)
          );
          const nextSelectedMainImageIds = state.selectedMainImageIds.filter((id) => !idSet.has(id));
          const nextPrimaryId = nextSelectedMainImageIds[0] ?? null;
          const nextPrimaryImg = nextPrimaryId
            ? nextMainImages.find((x) => x.id === nextPrimaryId) ??
              nextMainHistoryImages.find((x) => x.id === nextPrimaryId)
            : null;

          // 删除 Step2 历史时，把对应来源的 Step3 历史也一起清掉，避免“孤儿展示图”。
          const nextGalleryHistoryImages = state.galleryHistoryImages.filter((x) => {
            if (x.isFavorite) return true;
            return !idSet.has(x.sourceMainImageId);
          });

          // Step3 当前集合用于 Step4，所以这里也清空并由用户重新生成。
          return {
            mainHistoryImages: nextMainHistoryImages,
            mainImages: nextMainImages,
            selectedMainImageIds: nextSelectedMainImageIds,
            selectedMainImageId: nextPrimaryId,
            selectedMainImageUrl: nextPrimaryImg?.url ?? null,
            galleryImages: [],
            galleryHistoryImages: nextGalleryHistoryImages,
            copywriting: emptyCopywriting,
            error: null,
          };
        });
        const s2 = get();
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s2.activeTaskId, pickTaskMeta(s2));
        try {
          await persistActiveWorkspace(s2);
        } catch {
          /* ignore */
        }
        return true;
      },

      deleteGalleryHistoryImagesBySelectors: (selectors) => {
        const selectorKeys = new Set(
          selectors.map((s) => galleryImageSelectorKey(s))
        );
        const idSet = new Set(selectors.map((s) => s.id));
        const matchSelector = (x: GalleryImage) =>
          selectorKeys.has(galleryImageSelectorKey(x));
        set((state) => {
          const nextGalleryHistoryImages = state.galleryHistoryImages.filter(
            (x) => x.isFavorite || !matchSelector(x)
          );
          // 当前集合中的项目通常 id 唯一，按 id 删除可兼容历史调用场景
          const nextGalleryImages = state.galleryImages.filter((x) => !idSet.has(x.id));
          return {
            galleryHistoryImages: nextGalleryHistoryImages,
            galleryImages: nextGalleryImages,
            copywriting: emptyCopywriting,
            error: null,
          };
        });
      },

      setCopywriting: (next) => {
        set({ copywriting: next });
        const s = get();
        if (tasksHydrated) scheduleDebouncedTaskMetaSave(s.activeTaskId, pickTaskMeta(s));
      },

      generateCopywriting: async () => {
        const {
          prompt,
          provider,
          activeTaskId,
          selectedMainImageId,
          selectedMainImageUrl,
          galleryImages,
        } = get();

        if (!selectedMainImageId) {
          set({ error: "请先在 Step 2 选择一张主视图。" });
          return;
        }
        if (!selectedMainImageUrl && !galleryImages.length) {
          set({ error: "没有可用的产品图：请先在 Step 2 生成并选中主视图。" });
          return;
        }

        set({
          error: null,
          status: withStep4Generating(get().status, true),
        });

        try {
          const res = await fetch("/api/generate-copy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              taskId: activeTaskId,
              prompt,
              selectedMainImageId,
              selectedMainImageUrl: selectedMainImageUrl ?? undefined,
              galleryImages,
            }),
          });

          if (!res.ok) {
            const data = (await res.json().catch(() => null)) as ApiError | null;
            throw new Error(data?.message || `生成文案失败（HTTP ${res.status}）`);
          }

          type GenerateCopyResponse = Copywriting & {
            debug_used_model?: string;
            debug_image_count?: number | null;
          };
          const data = (await res.json()) as GenerateCopyResponse;

          set({
            copywriting: {
              title: data.title ?? "",
              tags: data.tags ?? [],
              description: data.description ?? "",
            },
            lastTextModelUsed:
              typeof data.debug_used_model === "string" ? data.debug_used_model : null,
            lastImageCountPassed:
              typeof data.debug_image_count === "number" ? data.debug_image_count : null,
            status: withStep4Generating(get().status, false),
            error: null,
            tasks: get().tasks.map((t) =>
              t.id === get().activeTaskId ? { ...t, currentStep: "STEP4", updatedAt: new Date().toISOString() } : t
            ),
          });
          void fetch("/api/tasks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: get().activeTaskId, currentStep: "STEP4" }),
          }).catch(() => undefined);
          const st = get();
          if (tasksHydrated) scheduleDebouncedTaskMetaSave(st.activeTaskId, pickTaskMeta(st));
        } catch (e) {
          const message = friendlyFetchErrorMessage(e);
          set({
            status: withStep4Generating(get().status, false),
            error: message || "生成文案时发生错误。",
            lastImageCountPassed: null,
          });
        }
      },
    }),
    {
      name: "jewelry-generator-v3",
      partialize: (state) => ({
        tasks: state.tasks,
        activeTaskId: state.activeTaskId,
        /** 与 IDB 双轨：避免仅依赖 IndexedDB 时刷新后输入框被空 meta 覆盖 */
        prompt: state.prompt,
      }),
      merge: (persisted, current) => {
        if (!persisted) return current as JewelryGeneratorStore;
        const p = persisted as Partial<JewelryGeneratorStore>;
        if (Array.isArray(p.tasks) && p.tasks.length > 0) {
          const active =
            p.activeTaskId && p.tasks.some((t) => t.id === p.activeTaskId)
              ? p.activeTaskId
              : p.tasks[0].id;
          return {
            ...(current as JewelryGeneratorStore),
            tasks: p.tasks,
            activeTaskId: active,
            ...(typeof p.prompt === "string" ? { prompt: p.prompt } : {}),
          };
        }
        const id = newTaskId();
        const now = new Date().toISOString();
        const promptStr = typeof p.prompt === "string" ? p.prompt : "";
        return {
          ...(current as JewelryGeneratorStore),
          ...p,
          tasks: [
            {
              id,
              name: "历史工作区",
              createdAt: now,
              updatedAt: now,
              searchLine: promptStr.trim().slice(0, 160),
              lastSuccessPrompt: promptStr.trim() || undefined,
              isProtected: false,
            },
          ],
          activeTaskId: id,
          ...(typeof p.prompt === "string" ? { prompt: p.prompt } : {}),
        };
      },
      onRehydrateStorage: () => (_rehydrated, error) => {
        if (error || typeof window === "undefined") return;
        // persist 在 localStorage 同步返回时会立刻跑完 then 链；此时 `export const useJewelryGeneratorStore = create(...)` 尚未赋值，会触发 TDZ。
        // 推迟到微任务之后，保证 store 已绑定到导出常量。
        queueMicrotask(() => {
          void (async () => {
            let hydrationDbApplied = false;
            try {
              const s0 = useJewelryGeneratorStore.getState();
            let activeId = s0.activeTaskId;
            if (!s0.tasks.some((t) => t.id === activeId)) {
              activeId = s0.tasks[0]?.id ?? activeId;
              useJewelryGeneratorStore.setState({ activeTaskId: activeId });
            }
            const historyTask = s0.tasks.find((t) => t.name === "历史工作区");
            const legacyTargetId = historyTask?.id ?? activeId;
            await migrateLegacyIdbToTask(legacyTargetId);
            // 旧逻辑只迁到「历史工作区」任务时，当前选中的任务 IDB 仍为空；再迁一次到 active，避免主图只出现在别的任务里。
            if (legacyTargetId !== activeId) {
              await migrateLegacyIdbToTask(activeId);
            }
            await mergeLegacyGalleryOnlyIfMissing(legacyTargetId);
            if (legacyTargetId !== activeId) {
              await mergeLegacyGalleryOnlyIfMissing(activeId);
            }
            activeId = useJewelryGeneratorStore.getState().activeTaskId;
            let loaded = await loadTaskFromIdb(activeId);
            const snap = useJewelryGeneratorStore.getState();
            const activeTask = snap.tasks.find((t) => t.id === activeId);
            const taskLine = activeTask?.searchLine?.trim() ?? "";
            const lastSuccess = activeTask?.lastSuccessPrompt?.trim() ?? "";
            const promptBackup = readTaskPromptBackup(activeId).trim();
            if (!loaded.meta.prompt.trim() && snap.prompt.trim()) {
              loaded = {
                ...loaded,
                meta: { ...loaded.meta, ...pickTaskMeta(snap) },
              };
              try {
                await saveTaskToIdb(activeId, loaded);
              } catch {
                /* 可能仅 meta 已写入；继续合并内存，避免整段 hydration 被跳过 */
              }
            } else if (!loaded.meta.prompt.trim()) {
              const fillPrompt = promptBackup || lastSuccess || taskLine;
              if (fillPrompt) {
                loaded = {
                  ...loaded,
                  meta: { ...loaded.meta, prompt: fillPrompt },
                };
                try {
                  await saveTaskToIdb(activeId, loaded);
                } catch {
                  /* loaded 已带 prompt，后续 setState 仍能恢复输入框 */
                }
              }
            }
            // 首次 load 与 setState 之间用户可能已完成 Step1 并 persist；再用旧空数据会清空 Step2 主图与历史。
            loaded = await loadTaskFromIdb(activeId);
            const activeFinal = useJewelryGeneratorStore.getState().tasks.find((t) => t.id === activeId);
            const taskLineFinal = activeFinal?.searchLine?.trim() ?? "";
            const lastSuccessFinal = activeFinal?.lastSuccessPrompt?.trim() ?? "";
            const backupFinal = readTaskPromptBackup(activeId).trim();
            const fillPromptFinal = backupFinal || lastSuccessFinal || taskLineFinal;
            if (!loaded.meta.prompt.trim() && fillPromptFinal) {
              loaded = {
                ...loaded,
                meta: { ...loaded.meta, prompt: fillPromptFinal },
              };
              try {
                await saveTaskToIdb(activeId, loaded);
              } catch {
                /* 补写失败时仍用 merged prompt 展示 */
              }
            }
            loaded = mergeLoadedWorkspaceWithMemory(activeId, loaded);
            const taskForPrompt = useJewelryGeneratorStore.getState().tasks.find((t) => t.id === activeId);
            const promptResolved = resolveWorkspacePromptForHydrate(
              activeId,
              loaded.meta.prompt,
              taskForPrompt
            );
            loaded = {
              ...loaded,
              meta: { ...loaded.meta, prompt: promptResolved },
            };
            useJewelryGeneratorStore.setState({
              provider: loaded.meta.provider,
              prompt: promptResolved,
              count: clampCount(loaded.meta.count),
              step1BananaImageModel: resolvedStep1BananaImageModel(loaded.meta),
              step2BananaImageModel: resolvedStep2BananaImageModel(loaded.meta),
              step1ExpansionStrength: loaded.meta.step1ExpansionStrength,
              step1FastMode: loaded.meta.step1FastMode,
              step2FastMode: loaded.meta.step2FastMode,
              selectedMainImageId: loaded.meta.selectedMainImageId,
              selectedMainImageUrl: loaded.meta.selectedMainImageUrl,
              selectedMainImageIds: loaded.meta.selectedMainImageIds,
              copywriting: loaded.meta.copywriting,
              lastTextModelUsed: loaded.meta.lastTextModelUsed,
              lastImageCountPassed: loaded.meta.lastImageCountPassed,
              mainImages: loaded.mainImages,
              mainHistoryImages: loaded.mainHistoryImages,
              galleryImages: loaded.galleryImages,
              galleryHistoryImages: loaded.galleryHistoryImages,
            });
              hydrationDbApplied = true;
            } catch (e) {
              console.error("[GemMuse] workspace IndexedDB hydration failed", e);
            } finally {
              tasksHydrated = true;
              if (hydrationDbApplied) {
                try {
                  await persistActiveWorkspace(useJewelryGeneratorStore.getState());
                } catch {
                  /* ignore */
                }
              }
              try {
                await useJewelryGeneratorStore.getState().syncActiveTaskWorkspaceFromServer();
              } catch {
                /* 离线或接口失败时保留本地 hydration 结果 */
              }
            }
          })();
        });
      },
    }
  )
);

// ========= 按任务写入 IndexedDB（主图 / 历史 / 当前展示图集合） =========
useJewelryGeneratorStore.subscribe((s, prev) => {
  if (!tasksHydrated) return;
  if (s.activeTaskId !== prev.activeTaskId) return;
  // Step1「重新生成整套」会先清空 mainImages；若此时写入 IDB，空快照会与 persist/hydration 竞态叠在一起导致丢图。
  // 单张 refresh（regenerateMainImage）不会清空 main，仍需照常写入。
  if (
    s.status.step1Generating &&
    prev.mainImages.length > 0 &&
    s.mainImages.length === 0
  ) {
    return;
  }

  const k = taskKeys(s.activeTaskId);
  if (s.mainImages !== prev.mainImages) {
    void idbSet(k.main, s.mainImages).catch(() => undefined);
  }
  if (s.mainHistoryImages !== prev.mainHistoryImages) {
    void idbSet(k.mainHist, s.mainHistoryImages).catch(() => undefined);
  }
  if (s.galleryHistoryImages !== prev.galleryHistoryImages) {
    void idbSet(k.galleryHist, s.galleryHistoryImages).catch(() => undefined);
  }
  if (s.galleryImages !== prev.galleryImages) {
    void idbSet(k.gallery, s.galleryImages).catch(() => undefined);
  }
});

