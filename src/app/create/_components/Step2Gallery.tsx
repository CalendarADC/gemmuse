"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useJewelryGeneratorStore } from "@/store/jewelryGeneratorStore";
import ImagePreviewModal from "./ImagePreviewModal";
import BrandButton from "./BrandButton";
import CircularSparkleGenerateButton from "./CircularSparkleGenerateButton";
import Step1FlipClock from "./Step1FlipClock";
import WindowedMount from "./WindowedMount";
import { emitToast } from "@/lib/ui/toast";
import { downloadImage } from "@/lib/ui/downloadImage";
import { CREATE_STEP_INSET, CREATE_STEP_PAPER } from "./createStepShell";
import { step1CircleBtnClass } from "./createToolbarCircleButton";
import { IconStep2Favorites, IconStep2History, IconStep2SelectAll } from "./step2ToolbarIcons";

const STEP2_MODEL_MENU_PANEL =
  "absolute left-0 top-full z-[35] mt-1.5 min-w-max max-w-[min(100vw-2rem,280px)] overflow-hidden rounded-xl border border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] py-1 shadow-lg";

/** 与 Step1 相同：`public/icons/step1-brain.png` */
function IconStep1Brain({ className }: { className?: string }) {
  return (
    <img
      src="/icons/step1-brain.png"
      alt=""
      width={18}
      height={18}
      decoding="async"
      draggable={false}
      className={["pointer-events-none h-[18px] w-[18px] shrink-0 object-contain select-none", className].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}

function getDataUrlExt(url: string): string {
  // url: data:image/png;base64,....
  if (url.startsWith("data:image/svg+xml")) return "svg";
  if (url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg")) return "jpg";
  if (url.startsWith("data:image/webp")) return "webp";
  return "png";
}

async function copyDataUrlImageToClipboard(dataUrl: string): Promise<boolean> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    if (!(blob instanceof Blob)) return false;
    if (!navigator.clipboard || typeof window.ClipboardItem === "undefined") return false;
    await navigator.clipboard.write([
      new window.ClipboardItem({
        [blob.type || "image/png"]: blob,
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export default function Step2Gallery() {
  const router = useRouter();
  const {
    mainImages,
    mainHistoryImages,
    selectedMainImageIds,
    toggleMainImageSelection,
    setMainImageSelection,
    toggleMainHistoryFavorite,
    status,
    regenerateMainImage,
    enhanceGalleryImages,
    deleteMainHistoryImagesByIds,
    error,
    step2ImageResolution,
    setStep2ImageResolution,
    step2BananaImageModel,
    setStep2BananaImageModel,
  } =
    useJewelryGeneratorStore();

  const [previewItems, setPreviewItems] = useState<
    Array<{ url: string; alt: string }>
  >([]);
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"current" | "history" | "favorites">("current");

  // 融入原 Step3：视角选择
  const [onModel, setOnModel] = useState(false);
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);
  const [rear, setRear] = useState(false);
  const [front, setFront] = useState(false);

  const step3StartedAt = status.step3GenerationStartedAt;
  const [step3TimerTick, setStep3TimerTick] = useState(0);

  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptModalText, setPromptModalText] = useState<string>("");
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [step2ModelMenuOpen, setStep2ModelMenuOpen] = useState(false);
  const step2ModelToolbarRef = useRef<HTMLDivElement>(null);

  const step2ToolbarBusy = status.step1Generating || status.step3Generating;

  const displayedImages = useMemo(() => {
    const all =
      viewMode === "history"
        ? [...mainHistoryImages, ...mainImages]
        : viewMode === "favorites"
          ? [...mainHistoryImages, ...mainImages].filter((x) => !!x.isFavorite)
          : mainImages;
    const dedup = new Map<string, (typeof mainImages)[number]>();
    for (const img of all) dedup.set(img.id, img as (typeof mainImages)[number]);
    return Array.from(dedup.values());
  }, [viewMode, mainHistoryImages, mainImages]);

  const currentCount = mainImages.length;
  const uniqueMainImageCount = useMemo(() => {
    const ids = new Set<string>();
    for (const x of mainImages) ids.add(x.id);
    for (const x of mainHistoryImages) ids.add(x.id);
    return ids.size;
  }, [mainImages, mainHistoryImages]);

  const displayedIds = useMemo(
    () => displayedImages.map((x) => x.id),
    [displayedImages]
  );
  const selectedInDisplayedCount = useMemo(
    () => displayedIds.filter((id) => selectedMainImageIds.includes(id)).length,
    [displayedIds, selectedMainImageIds]
  );
  const isAllDisplayedSelected =
    displayedIds.length > 0 && selectedInDisplayedCount === displayedIds.length;

  const selectedInHistoryCount = useMemo(() => {
    if (viewMode === "current") return 0;
    const historyIds = new Set(mainHistoryImages.map((x) => x.id));
    return selectedMainImageIds.filter((id) => historyIds.has(id)).length;
  }, [viewMode, mainHistoryImages, selectedMainImageIds]);

  useEffect(() => {
    // 仅在打开预览时维护 previewIndex 合法性；具体图片 url 由 items 传入决定
    setPreviewIndex((i) => {
      if (!previewItems.length) return 0;
      return Math.max(0, Math.min(i, previewItems.length - 1));
    });
  }, [previewItems.length]);

  useEffect(() => {
    if (step3StartedAt == null) return;
    const id = window.setInterval(() => setStep3TimerTick((t) => t + 1), 200);
    return () => window.clearInterval(id);
  }, [step3StartedAt]);

  useEffect(() => {
    if (step2ToolbarBusy) setStep2ModelMenuOpen(false);
  }, [step2ToolbarBusy]);

  useEffect(() => {
    if (!step2ModelMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (step2ModelToolbarRef.current?.contains(e.target as Node)) return;
      setStep2ModelMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStep2ModelMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [step2ModelMenuOpen]);

  const displayElapsedMs =
    status.step3Generating && step3StartedAt != null
      ? Date.now() - step3StartedAt + step3TimerTick * 0
      : 0;

  const canStartGalleryEnhance =
    selectedMainImageIds.length > 0 && (onModel || left || right || rear || front);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-lg font-bold text-gray-900 md:text-xl">Step 2：选择主图加工</div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            aria-pressed={viewMode === "favorites"}
            aria-label="我的最爱"
            title="我的最爱"
            className={step1CircleBtnClass(viewMode === "favorites", false)}
            onClick={() => setViewMode((v) => (v === "favorites" ? "current" : "favorites"))}
          >
            <IconStep2Favorites className="shrink-0" />
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "history"}
            aria-label="历史记录"
            title="历史记录"
            className={step1CircleBtnClass(viewMode === "history", false)}
            onClick={() => setViewMode((v) => (v === "history" ? "current" : "history"))}
          >
            <IconStep2History className="shrink-0" />
          </button>
          <button
            type="button"
            disabled={
              status.step1Generating || status.step3Generating || displayedIds.length === 0
            }
            aria-pressed={isAllDisplayedSelected}
            aria-label={isAllDisplayedSelected ? "清除全选" : "全选"}
            title={isAllDisplayedSelected ? "清除全选" : "全选"}
            className={step1CircleBtnClass(
              isAllDisplayedSelected,
              status.step1Generating || status.step3Generating || displayedIds.length === 0
            )}
            onClick={() => {
              if (isAllDisplayedSelected) setMainImageSelection([]);
              else setMainImageSelection(displayedIds);
            }}
          >
            <IconStep2SelectAll className="shrink-0" />
          </button>
          <div className="text-xs text-gray-500">
            {displayedIds.length ? `${selectedInDisplayedCount} / ${displayedIds.length} Selected` : "0 / 0 Selected"}
          </div>
          {viewMode !== "current" ? (
            <div className="text-xs text-gray-500">
              当前集 {currentCount} 张 · 主图库累计 {uniqueMainImageCount} 张（含历史）
            </div>
          ) : null}
        </div>
      </div>

      <div className={`${CREATE_STEP_PAPER} space-y-4`}>
      {viewMode !== "current" && selectedInHistoryCount > 0 ? (
        <div className="flex justify-end">
          <BrandButton
            type="button"
            variant="danger"
            shape="full"
            disabled={status.step1Generating || status.step3Generating}
            onClick={() => {
              const idsToDelete = selectedMainImageIds.filter((id) =>
                mainHistoryImages.some((x) => x.id === id)
              );
              if (!idsToDelete.length) return;
              setConfirmDeleteIds(idsToDelete);
            }}
            className="h-[34px] px-4 text-sm"
          >
            删除选中历史
          </BrandButton>
        </div>
      ) : null}

      {displayedImages.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {displayedImages.map((img) => {
            const selected = selectedMainImageIds.includes(img.id);
            const isInCurrent = mainImages.some((x) => x.id === img.id);
            const canFavorite = mainHistoryImages.some((x) => x.id === img.id) || !isInCurrent;

            return (
              <WindowedMount
                key={img.id}
                estimatedHeight={285}
                enabled={viewMode !== "current"}
              >
                <div
                  data-main-card="1"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    const items = displayedImages.map((x) => ({
                      url: x.url,
                      alt: "主视图",
                    }));
                    const idx = displayedImages.findIndex((x) => x.id === img.id);
                    setPreviewItems(items);
                    setPreviewIndex(idx >= 0 ? idx : 0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      const items = displayedImages.map((x) => ({
                        url: x.url,
                        alt: "主视图",
                      }));
                      const idx = displayedImages.findIndex((x) => x.id === img.id);
                      setPreviewItems(items);
                      setPreviewIndex(idx >= 0 ? idx : 0);
                    }
                  }}
                  className={[
                    "relative overflow-hidden rounded-2xl border bg-[var(--create-surface-paper)] text-left shadow-[0_1px_8px_rgba(45,55,72,0.06)]",
                    selected
                      ? "border-[#C5A059]"
                      : "border-[rgba(94,111,130,0.18)] hover:border-[rgba(199,178,153,0.55)]",
                  ].join(" ")}
                >
                  <div className="aspect-square bg-[color-mix(in_srgb,var(--create-surface-tray)_42%,var(--create-surface-paper))]">
                    <img
                      src={img.url}
                      alt="主视图"
                      draggable={false}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>

                {/* 左上角：选中指示圆圈（只点击圆圈才表示选中） */}
                <button
                  type="button"
                  aria-label={selected ? "取消选中主视图" : "选中主视图"}
                  aria-pressed={selected}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMainImageSelection(img.id);
                  }}
                  className={[
                    "absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur",
                    selected ? "border-blue-600 bg-blue-600" : "border-gray-300 bg-white/90",
                  ].join(" ")}
                >
                  {selected ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path
                        d="M20 6L9 17L4 12"
                        stroke="white"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </button>

                {/* 左下角：下载箭头（不触发预览） */}
                <button
                  type="button"
                  aria-label="查看该图片对应的提示词"
                  onClick={(e) => {
                    e.stopPropagation();
                    const text = img.debugPromptZh
                      ? img.debugPromptZh
                      : "该图片没有保存对应的提示词信息。请重新生成主视图（Step 1），然后再查看。";
                    setPromptModalText(text);
                    setShowPromptModal(true);
                  }}
                  className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 ring-1 ring-gray-200 hover:bg-white backdrop-blur"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                </button>

                <button
                  type="button"
                  aria-label="下载主视图"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await downloadImage(img.url, `main_${img.id}.${getDataUrlExt(img.url)}`);
                    } catch {
                      emitToast({ message: "下载失败：图片地址不可访问或跨域受限。", type: "error" });
                    }
                  }}
                  className="absolute left-2 bottom-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-gray-800 ring-1 ring-gray-200 hover:bg-white"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* 左下角旁：专用拖拽导出按钮（避免整卡拖拽导致浏览器残留态） */}
                <button
                  type="button"
                  aria-label="复制图片到剪贴板"
                  title="复制图片到剪贴板"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const ok = await copyDataUrlImageToClipboard(img.url);
                    if (ok) {
                      setCopiedId(img.id);
                      emitToast({ message: "已复制图片到剪贴板", type: "success" });
                      window.setTimeout(() => setCopiedId((id) => (id === img.id ? null : id)), 1200);
                    } else {
                      emitToast({
                        message:
                          "复制失败：请在 HTTPS 或 localhost 环境使用支持图片剪贴板的浏览器（如 Chrome/Edge）。",
                        type: "error",
                        durationMs: 2200,
                      });
                    }
                  }}
                  className={[
                    "absolute left-12 bottom-2 inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 backdrop-blur",
                    copiedId === img.id
                      ? "bg-green-600 text-white ring-green-600"
                      : "bg-white/90 text-gray-700 ring-gray-200 hover:bg-white",
                  ].join(" ")}
                >
                  {copiedId === img.id ? (
                    <span className="text-xs font-bold">✓</span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
                      <path d="M5 15V7a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                </button>

                {/* 右下角：历史/最爱模式下显示收藏星标；当前模式显示重试 */}
                {viewMode !== "current" && canFavorite ? (
                  <button
                    type="button"
                    aria-label={img.isFavorite ? "取消收藏" : "收藏"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMainHistoryFavorite(img.id);
                    }}
                    className={[
                      "absolute right-2 bottom-2 inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 backdrop-blur",
                      img.isFavorite
                        ? "border-amber-300 bg-amber-50 text-amber-800 ring-amber-300/70"
                        : "bg-white/90 text-[#5E6F82] ring-[#5E6F82]/30 hover:bg-white",
                    ].join(" ")}
                  >
                    ★
                  </button>
                ) : null}

                {viewMode === "current" && isInCurrent ? (
                  <button
                    type="button"
                    aria-label="重试这张主图"
                    disabled={status.step1Generating || refreshingId === img.id}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setRefreshingId(img.id);
                      try {
                        await regenerateMainImage(img.id);
                      } finally {
                        setRefreshingId(null);
                      }
                    }}
                    className="absolute right-2 bottom-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[#5E6F82] ring-1 ring-[#5E6F82]/30 hover:bg-white backdrop-blur disabled:opacity-50"
                  >
                    <span
                      className={
                        refreshingId === img.id
                          ? "inline-block animate-spin"
                          : "inline-block"
                      }
                    >
                      ↻
                    </span>
                  </button>
                ) : null}
                </div>
              </WindowedMount>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[rgba(94,111,130,0.22)] bg-[color-mix(in_srgb,var(--create-surface-paper)_70%,var(--create-surface-tray))] p-6 text-sm text-gray-600">
          {viewMode === "favorites"
            ? "暂无收藏主视图。可在历史记录中点击右下角星标收藏。"
            : "还没有生成主视图。请先完成 Step 1。"}
        </div>
      )}
      {status.step1Generating ? (
        <div className="text-xs text-gray-500">正在生成中...</div>
      ) : null}

      <div className={`space-y-2 ${CREATE_STEP_INSET}`}>
        <div className="flex w-full flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="shrink-0 text-sm font-semibold text-[#5c534c]">新增其他视角</div>

            <div className="flex flex-wrap items-center gap-3" role="group" aria-label="多视角选择">
              <button
                type="button"
                disabled={status.step3Generating}
                aria-pressed={onModel}
                aria-label="穿戴图"
                title="穿戴图"
                className={step1CircleBtnClass(onModel, status.step3Generating)}
                onClick={() => setOnModel((v) => !v)}
              >
                <span className="pointer-events-none select-none text-sm font-semibold leading-none">穿</span>
              </button>

              <button
                type="button"
                disabled={status.step3Generating}
                aria-pressed={front}
                aria-label="正视图"
                title="正视图"
                className={step1CircleBtnClass(front, status.step3Generating)}
                onClick={() => setFront((v) => !v)}
              >
                <span className="pointer-events-none select-none text-sm font-semibold leading-none">正</span>
              </button>

              <button
                type="button"
                disabled={status.step3Generating}
                aria-pressed={left}
                aria-label="左侧视图"
                title="左侧视图"
                className={step1CircleBtnClass(left, status.step3Generating)}
                onClick={() => setLeft((v) => !v)}
              >
                <span className="pointer-events-none select-none text-sm font-semibold leading-none">左</span>
              </button>

              <button
                type="button"
                disabled={status.step3Generating}
                aria-pressed={right}
                aria-label="右侧视图"
                title="右侧视图"
                className={step1CircleBtnClass(right, status.step3Generating)}
                onClick={() => setRight((v) => !v)}
              >
                <span className="pointer-events-none select-none text-sm font-semibold leading-none">右</span>
              </button>

              <button
                type="button"
                disabled={status.step3Generating}
                aria-pressed={rear}
                aria-label="后视图"
                title="后视图"
                className={step1CircleBtnClass(rear, status.step3Generating)}
                onClick={() => setRear((v) => !v)}
              >
                <span className="pointer-events-none select-none text-sm font-semibold leading-none">后</span>
              </button>
            </div>

            <div className="relative" ref={step2ModelToolbarRef}>
              <button
                type="button"
                disabled={step2ToolbarBusy}
                aria-haspopup="listbox"
                aria-expanded={step2ModelMenuOpen}
                aria-pressed={step2BananaImageModel === "banana-pro"}
                aria-label="Step2 生图模型：Banana pro、Banana 2 或 gpt-image-2（老张）"
                title={
                  step2BananaImageModel === "banana-2"
                    ? "当前 Banana 2，点击更换"
                    : step2BananaImageModel === "gpt-image-2"
                      ? "当前 gpt-image-2，点击更换"
                      : "当前 Banana pro，点击更换"
                }
                className={step1CircleBtnClass(step2BananaImageModel === "banana-pro", step2ToolbarBusy)}
                onClick={(e) => {
                  e.stopPropagation();
                  setStep2ModelMenuOpen((o) => !o);
                }}
              >
                <IconStep1Brain className="shrink-0" />
              </button>
              {step2ModelMenuOpen && !step2ToolbarBusy ? (
                <div
                  role="listbox"
                  aria-label="选择 Step2 生图模型"
                  className={STEP2_MODEL_MENU_PANEL}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={step2BananaImageModel === "banana-pro"}
                    className={`block w-full whitespace-nowrap px-3 py-2 text-left text-sm transition ${
                      step2BananaImageModel === "banana-pro"
                        ? "bg-amber-50 font-semibold text-amber-900"
                        : "text-[#363028] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_12%,var(--create-surface-paper))]"
                    }`}
                    onClick={() => {
                      setStep2BananaImageModel("banana-pro");
                      setStep2ModelMenuOpen(false);
                    }}
                  >
                    Banana pro
                  </button>
                  <button
                    type="button"
                    role="option"
                    aria-selected={step2BananaImageModel === "banana-2"}
                    className={`block w-full whitespace-nowrap px-3 py-2 text-left text-sm transition ${
                      step2BananaImageModel === "banana-2"
                        ? "bg-amber-50 font-semibold text-amber-900"
                        : "text-[#363028] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_12%,var(--create-surface-paper))]"
                    }`}
                    onClick={() => {
                      setStep2BananaImageModel("banana-2");
                      setStep2ModelMenuOpen(false);
                    }}
                  >
                    Banana 2
                  </button>
                  <button
                    type="button"
                    role="option"
                    aria-selected={step2BananaImageModel === "gpt-image-2"}
                    className={`block w-full whitespace-nowrap px-3 py-2 text-left text-sm transition ${
                      step2BananaImageModel === "gpt-image-2"
                        ? "bg-amber-50 font-semibold text-amber-900"
                        : "text-[#363028] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_12%,var(--create-surface-paper))]"
                    }`}
                    onClick={() => {
                      setStep2BananaImageModel("gpt-image-2");
                      setStep2ModelMenuOpen(false);
                    }}
                  >
                    gpt-image-2
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              disabled={status.step3Generating}
              aria-pressed={step2ImageResolution !== "1K"}
              aria-label={`当前分辨率：${step2ImageResolution}，点击切换`}
              title={`当前分辨率：${step2ImageResolution}，点击切换（1K → 2K → 4K）`}
              className={step1CircleBtnClass(step2ImageResolution !== "1K", status.step3Generating)}
              onClick={() => {
                const next: Record<string, "1K" | "2K" | "4K"> = {
                  "1K": "2K",
                  "2K": "4K",
                  "4K": "1K",
                };
                setStep2ImageResolution(next[step2ImageResolution]);
              }}
            >
              <span className="pointer-events-none select-none text-sm font-semibold tabular-nums leading-none text-[#454038]">
                {step2ImageResolution}
              </span>
            </button>
          </div>

          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            <CircularSparkleGenerateButton
              canStart={canStartGalleryEnhance}
              loading={status.step3Generating}
              onClick={async () => {
                const ok = await enhanceGalleryImages({ onModel, left, right, rear, front });
                if (ok) router.push("/create/gallery");
              }}
              ariaLabel="生成展示图组合"
              title="生成展示图组合"
            />
          </div>
        </div>

        {status.step3Generating ? (
          <div className="mt-3 flex w-full justify-center">
            <Step1FlipClock totalSeconds={Math.floor(displayElapsedMs / 1000)} />
          </div>
        ) : null}

        {error ? <div className="text-sm text-red-600">{error}</div> : null}
      </div>
      </div>

      {showPromptModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4"
          onClick={() => {
            setShowPromptModal(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-semibold">生成提示词（中文）</div>
              <button
                type="button"
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                onClick={() => setShowPromptModal(false)}
              >
                关闭
              </button>
            </div>
            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words px-4 py-4 text-xs text-gray-800">
              {promptModalText}
            </pre>
          </div>
        </div>
      ) : null}

      <ImagePreviewModal
        open={previewItems.length > 0}
        items={previewItems}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        onClose={() => {
          setPreviewItems([]);
          setPreviewIndex(0);
        }}
      />

      {confirmDeleteIds ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmDeleteIds(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-gray-900">确认删除 Step2 历史图片</div>
            <p className="mt-2 text-sm text-gray-700">
              将删除选中的 {confirmDeleteIds.length} 张历史图片。已收藏（★）的图片会自动保留。确认继续吗？
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <BrandButton
                type="button"
                variant="outline"
                shape="full"
                onClick={() => setConfirmDeleteIds(null)}
                className="h-[34px] px-4 text-sm"
              >
                取消
              </BrandButton>
              <BrandButton
                type="button"
                variant="danger"
                shape="full"
                onClick={() => {
                  const ids = confirmDeleteIds;
                  const keptFavorite = ids.filter((id) =>
                    mainHistoryImages.some((x) => x.id === id && x.isFavorite)
                  );
                  void (async () => {
                    const ok = await deleteMainHistoryImagesByIds(ids);
                    if (ok) setConfirmDeleteIds(null);
                    if (keptFavorite.length === ids.length) {
                      emitToast({
                        type: "info",
                        message: "所选图片均已收藏（★），请先取消收藏后再删除。",
                      });
                    } else if (ok && keptFavorite.length > 0) {
                      emitToast({
                        type: "info",
                        message: `已删除可删项；另有 ${keptFavorite.length} 张因已收藏而保留。`,
                      });
                    }
                  })();
                }}
                className="h-[34px] px-4 text-sm transition-all hover:brightness-110 hover:shadow-[0_6px_16px_rgba(220,38,38,0.25)] focus-visible:ring-2 focus-visible:ring-red-300"
              >
                确认删除
              </BrandButton>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
