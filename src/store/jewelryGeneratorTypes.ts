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

export type GeneratorStatus = {
  step1Generating: boolean;
  step3Generating: boolean;
  step4Generating: boolean;
  /** 各步生成开始时间（ms），用于跨页面卸载后仍能连续计时 */
  step1GenerationStartedAt: number | null;
  step3GenerationStartedAt: number | null;
  step4GenerationStartedAt: number | null;
};

export type JewelryGeneratorStore = {
  // ========== 多任务 ==========
  authUserId: string | null;
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
  initializeUserScope: (userId: string) => Promise<void>;
  prepareForSignOut: () => void;

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
  /** 先删云端 GeneratedImage，再更新本地；否则下次同步会把已删图并回（见 mergeGalleryDedupe） */
  deleteGalleryHistoryImagesBySelectors: (selectors: GalleryImageSelector[]) => Promise<boolean>;

  // 从历史集合中切换到指定 setId 对应的当前集合（用于 Step4）
  setGallerySetAsCurrent: (setId: string) => void;

  // Step 4: 设置/生成文案
  setCopywriting: (next: Copywriting) => void;
  generateCopywriting: () => Promise<void>;
};
