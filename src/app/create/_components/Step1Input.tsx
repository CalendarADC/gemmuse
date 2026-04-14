"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useJewelryGeneratorStore } from "@/store/jewelryGeneratorStore";
import Step1FlipClock from "./Step1FlipClock";
import Step1GenerateButton from "./Step1GenerateButton";
import { applyStep1ReferenceFromGalleryUrl } from "@/lib/ui/applyStep1ReferenceFromGalleryUrl";
import { consumeGalleryDragPayload, GALLERY_DRAG_REF_MIME } from "@/lib/ui/galleryDragPayload";
import { STEP1_CIRCLE_BTN_BASE, step1CircleBtnClass } from "./createToolbarCircleButton";
import ResolutionToggleIcon from "./ResolutionToggleIcon";

const MAX_REFERENCE_FILE_BYTES = 12 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 5;

const STEP1_PROMPT_HINT = "输入您的灵感火花，我们帮您实现";

/** 约等于 text-sm + leading-relaxed + p-2 垂直内边距的一行高度 */
const STEP1_PROMPT_TEXTAREA_MIN_PX = 40;
const STEP1_PROMPT_TEXTAREA_MAX_PX = 320;

type Step1ToolbarMenu = "model" | "count";

const STEP1_MENU_PANEL =
  "absolute left-0 top-full z-[35] mt-1.5 min-w-[158px] overflow-hidden rounded-xl border border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] py-1 shadow-lg";

/** 渠道选项文案较长，单独加宽并禁止折行，避免「老张」被拆成两行 */
const STEP1_MODEL_MENU_PANEL =
  "absolute left-0 top-full z-[35] mt-1.5 min-w-max max-w-[min(100vw-2rem,280px)] overflow-hidden rounded-xl border border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] py-1 shadow-lg";

/** 生图模型按钮：原「大脑」参考图，置于 public/icons/step1-brain.png */
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

/** 创意模式按钮：灯泡 + 齿轮（用户 PNG） */
function IconStep1CreativeLightbulb({ className }: { className?: string }) {
  return (
    <img
      src="/icons/step1-creative-lightbulb.png"
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

/** 清空参考图：红色垃圾桶，置于 public/icons/step1-clear-reference.png */
function IconStep1ClearReference({ className }: { className?: string }) {
  return (
    <img
      src="/icons/step1-clear-reference.png"
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("invalid result"));
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function isLikelyImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|avif|svg)$/i.test(file.name || "");
}

function pickImageUrlFromDataTransfer(dt: DataTransfer): string | null {
  const uriBlock = dt.getData("text/uri-list");
  const firstUri = uriBlock
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith("#"));
  if (firstUri && /^https?:\/\//i.test(firstUri)) return firstUri;

  const plain = dt.getData("text/plain").trim();
  if (plain && /^https?:\/\//i.test(plain.split(/\s/)[0] ?? "")) {
    return plain.split(/\s/)[0] ?? null;
  }

  const html = dt.getData("text/html");
  if (html) {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const src = doc.querySelector("img[src]")?.getAttribute("src");
      if (src) {
        try {
          return new URL(src, typeof window !== "undefined" ? window.location.href : "http://localhost").href;
        } catch {
          return src.startsWith("http") ? src : null;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export default function Step1Input() {
  const {
    prompt,
    count,
    step1BananaImageModel,
    step1ExpansionStrength,
    step1FastMode,
    status,
    error,
    step1ReferenceImageDataUrls,
    setPrompt,
    setCount,
    setStep1BananaImageModel,
    setStep1ExpansionStrength,
    setStep1FastMode,
    setProvider,
    addStep1ReferenceImage,
    removeStep1ReferenceImageAt,
    clearStep1ReferenceImages,
  } = useJewelryGeneratorStore();
  const isGenerating = status.step1Generating;
  const hasStep1References = step1ReferenceImageDataUrls.length > 0;
  const step1ReferenceUploadDisabled =
    isGenerating || step1ReferenceImageDataUrls.length >= MAX_REFERENCE_IMAGES;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputId = useId();
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [promptInputFocused, setPromptInputFocused] = useState(false);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState<Step1ToolbarMenu | null>(null);
  const step1ToolbarRef = useRef<HTMLDivElement>(null);
  const step1StartedAt = status.step1GenerationStartedAt;
  const [step1TimerTick, setStep1TimerTick] = useState(0);

  const syncPromptTextareaHeight = useCallback(() => {
    const ta = promptInputRef.current;
    if (!ta || typeof window === "undefined") return;
    ta.style.height = "auto";
    const max = Math.min(window.innerHeight * 0.4, STEP1_PROMPT_TEXTAREA_MAX_PX);
    const sh = ta.scrollHeight;
    const next = Math.min(Math.max(sh, STEP1_PROMPT_TEXTAREA_MIN_PX), max);
    ta.style.height = `${next}px`;
    ta.style.overflowY = sh > max ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    syncPromptTextareaHeight();
  }, [prompt, syncPromptTextareaHeight]);

  useEffect(() => {
    const zone = pasteZoneRef.current;
    if (!zone || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => syncPromptTextareaHeight());
    ro.observe(zone);
    return () => ro.disconnect();
  }, [syncPromptTextareaHeight]);

  useEffect(() => {
    if (isGenerating) setToolbarMenuOpen(null);
  }, [isGenerating]);

  useEffect(() => {
    if (step1StartedAt == null) return;
    const id = window.setInterval(() => setStep1TimerTick((t) => t + 1), 200);
    return () => window.clearInterval(id);
  }, [step1StartedAt]);

  const step1GenElapsedMs =
    step1StartedAt != null && isGenerating ? Date.now() - step1StartedAt + step1TimerTick * 0 : 0;

  useEffect(() => {
    if (!toolbarMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (step1ToolbarRef.current?.contains(e.target as Node)) return;
      setToolbarMenuOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToolbarMenuOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [toolbarMenuOpen]);

  // Step 1 只调用 nano-banana-pro：强制 provider 固定
  useEffect(() => {
    setProvider("nano-banana-pro");
  }, [setProvider]);

  const appendReferenceFromFile = async (file: File, source: "file" | "paste" | "drop") => {
    if (useJewelryGeneratorStore.getState().step1ReferenceImageDataUrls.length >= MAX_REFERENCE_IMAGES) {
      setUploadHint(`最多 ${MAX_REFERENCE_IMAGES} 张参考图，请先删除一张再添加。`);
      return false;
    }

    if (!isLikelyImageFile(file)) {
      setUploadHint(
        source === "paste"
          ? "剪贴板里没有图片，请粘贴截图或从相册/网页复制图片后再试。"
          : source === "drop"
            ? "拖入的文件不是常见图片格式，请换一张图片。"
            : "请选择图片文件（jpg / png / webp 等）。"
      );
      return false;
    }
    if (file.size > MAX_REFERENCE_FILE_BYTES) {
      setUploadHint(`图片需小于 ${MAX_REFERENCE_FILE_BYTES / (1024 * 1024)}MB，请压缩后重试。`);
      return false;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const ok = useJewelryGeneratorStore.getState().addStep1ReferenceImage(dataUrl);
      if (!ok) {
        setUploadHint(`最多 ${MAX_REFERENCE_IMAGES} 张参考图，请先删除一张再添加。`);
        return false;
      }
      setUploadHint(null);
      return true;
    } catch {
      setUploadHint("读取图片失败，请重试。");
      return false;
    }
  };

  const onPickReferenceFile = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList).filter(isLikelyImageFile);
    void (async () => {
      for (const file of files) {
        const added = await appendReferenceFromFile(file, "file");
        if (!added && useJewelryGeneratorStore.getState().step1ReferenceImageDataUrls.length >= MAX_REFERENCE_IMAGES) {
          if (files.length > 1) {
            setUploadHint(`最多 ${MAX_REFERENCE_IMAGES} 张参考图，已添加部分图片，其余已忽略。`);
          }
          break;
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    })();
  };

  const onPasteReference = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (isGenerating) return;

    const items = e.clipboardData?.items;
    if (!items?.length) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void appendReferenceFromFile(file, "paste");
          return;
        }
      }
    }

    const files = e.clipboardData?.files;
    if (files?.length) {
      const f = files[0];
      if (f?.type.startsWith("image/")) {
        e.preventDefault();
        void appendReferenceFromFile(f, "paste");
      }
    }
  };

  const tryLoadImageFromRemoteUrl = async (url: string) => {
    if (useJewelryGeneratorStore.getState().step1ReferenceImageDataUrls.length >= MAX_REFERENCE_IMAGES) {
      setUploadHint(`最多 ${MAX_REFERENCE_IMAGES} 张参考图，请先删除一张再添加。`);
      return;
    }
    setUploadHint(null);
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const headerType = (res.headers.get("content-type") || "").split(";")[0]?.trim() || "";
      const blobType = blob.type && blob.type !== "application/octet-stream" ? blob.type : "";
      const mime = blobType || headerType;
      const urlLooksImage = /\.(jpe?g|png|gif|webp|bmp|avif|svg)(\?|#|$)/i.test(
        url.split("?")[0] ?? ""
      );
      if (!mime.startsWith("image/") && !urlLooksImage) {
        setUploadHint("链接内容不是图片，请直接拖拽图片文件或另存后再拖入。");
        return;
      }
      if (blob.size > MAX_REFERENCE_FILE_BYTES) {
        setUploadHint(`图片需小于 ${MAX_REFERENCE_FILE_BYTES / (1024 * 1024)}MB，请压缩后重试。`);
        return;
      }
      const effectiveMime = mime.startsWith("image/") ? mime : "image/png";
      const ext = effectiveMime.includes("jpeg") ? "jpg" : effectiveMime.includes("webp") ? "webp" : "png";
      const file = new File([blob], `reference.${ext}`, { type: effectiveMime });
      void appendReferenceFromFile(file, "drop");
    } catch {
      setUploadHint(
        "无法从该链接下载图片（常被目标站禁止跨域）。请改用：把图片拖到本框，或右键「图片另存为」后拖入文件。"
      );
    }
  };

  const onDropReference = (e: React.DragEvent<HTMLDivElement>) => {
    if (isGenerating) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const dt = e.dataTransfer;
    if (!dt) return;

    const galleryRefId = dt.getData(GALLERY_DRAG_REF_MIME);
    if (galleryRefId) {
      const src = consumeGalleryDragPayload(galleryRefId);
      if (!src) {
        setUploadHint("画廊拖拽已失效，请重新长按解锁后再拖到参考图区域。");
        return;
      }
      void (async () => {
        const r = await applyStep1ReferenceFromGalleryUrl(src);
        setUploadHint(r.ok ? null : r.hint);
      })();
      return;
    }

    const collectImageFiles = (): File[] => {
      const out: File[] = [];
      const files = dt.files;
      if (files?.length) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (f && isLikelyImageFile(f)) out.push(f);
        }
      }
      if (!out.length && dt.items?.length) {
        for (let i = 0; i < dt.items.length; i++) {
          const item = dt.items[i];
          if (item.kind === "file") {
            const f = item.getAsFile();
            if (f && isLikelyImageFile(f)) out.push(f);
          }
        }
      }
      return out;
    };

    const imageFiles = collectImageFiles();
    if (imageFiles.length) {
      void (async () => {
        let added = 0;
        for (const f of imageFiles) {
          if (useJewelryGeneratorStore.getState().step1ReferenceImageDataUrls.length >= MAX_REFERENCE_IMAGES) {
            if (imageFiles.length > 1 && added > 0 && added < imageFiles.length) {
              setUploadHint(`最多 ${MAX_REFERENCE_IMAGES} 张参考图，已添加部分图片，其余已忽略。`);
            }
            break;
          }
          const ok = await appendReferenceFromFile(f, "drop");
          if (ok) added += 1;
        }
      })();
      return;
    }

    const url = pickImageUrlFromDataTransfer(dt);
    if (url) {
      void tryLoadImageFromRemoteUrl(url);
      return;
    }

    setUploadHint("未识别到图片。请拖入图片文件，或从网页把图片拖到本框内（部分站点仅支持另存为后拖拽）。");
  };

  return (
    <div className="space-y-4">
      <div
        ref={pasteZoneRef}
        data-step1-reference-dropzone="1"
        tabIndex={0}
        role="region"
        aria-label="输入框区域，支持参考图粘贴、拖拽与上传"
        onPaste={onPasteReference}
        onClick={(e) => {
          if (isGenerating) return;
          const target = e.target as HTMLElement | null;
          if (target?.closest("button, label, input, select, option, textarea")) return;
          promptInputRef.current?.focus();
        }}
        onDragEnter={(e) => {
          if (isGenerating) return;
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          if (isGenerating) return;
          e.preventDefault();
          const related = e.relatedTarget as Node | null;
          if (!related || !e.currentTarget.contains(related)) {
            setIsDragOver(false);
          }
        }}
        onDragOver={(e) => {
          if (isGenerating) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={onDropReference}
        className={`rounded-2xl border p-3 outline-none transition-[box-shadow,background-color,border-color] focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 ${
          isGenerating
            ? "cursor-not-allowed border-[rgba(94,111,130,0.18)] bg-[color-mix(in_srgb,var(--create-surface-paper)_88%,var(--create-surface-tray))] opacity-60 shadow-[0_2px_10px_rgba(45,55,72,0.05)]"
            : "cursor-text"
        } ${
          isDragOver && !isGenerating
            ? "border-blue-400 bg-blue-50/90 shadow-[0_4px_20px_rgba(37,99,235,0.12)] ring-2 ring-blue-300 ring-offset-2"
            : !isGenerating
              ? "border-[rgba(94,111,130,0.2)] bg-[var(--create-surface-paper)] shadow-[0_2px_14px_rgba(45,55,72,0.07),0_0_0_1px_rgba(255,255,255,0.55)_inset]"
              : ""
        }`}
      >
        <div className="relative">
          {!prompt.trim() && !promptInputFocused ? (
            <div
              className="pointer-events-none absolute inset-0 z-[1] p-2"
              aria-hidden
            >
              <span className="step1-prompt-hint-line text-sm leading-relaxed text-gray-400">
                {STEP1_PROMPT_HINT}
              </span>
            </div>
          ) : null}
          <textarea
            ref={promptInputRef}
            rows={1}
            className="relative z-[2] max-h-[min(40vh,320px)] w-full resize-none overflow-hidden rounded-xl border-0 bg-transparent p-2 text-sm leading-relaxed text-gray-900 outline-none placeholder:text-transparent"
            value={prompt}
            placeholder={STEP1_PROMPT_HINT}
            aria-label={STEP1_PROMPT_HINT}
            onChange={(e) => setPrompt(e.target.value)}
            onFocus={() => setPromptInputFocused(true)}
            onBlur={() => setPromptInputFocused(false)}
          />
        </div>

        {uploadHint ? <p className="mt-2 text-xs text-amber-700">{uploadHint}</p> : null}

        {step1ReferenceImageDataUrls.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {step1ReferenceImageDataUrls.map((src, index) => (
              <div key={`${index}-${src.slice(0, 48)}`} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`参考图 ${index + 1}`}
                  className="h-14 w-14 rounded-lg border border-gray-200 object-cover shadow-sm"
                />
                <button
                  type="button"
                  disabled={isGenerating}
                  title="移除此参考图"
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-[var(--create-surface-paper)] text-[10px] font-bold text-gray-700 shadow hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    removeStep1ReferenceImageAt(index);
                    setUploadHint(null);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div ref={step1ToolbarRef}>
        <div className="mt-3 flex w-full flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={step1ReferenceUploadDisabled}
              onChange={(e) => onPickReferenceFile(e.target.files)}
            />
            <label
              htmlFor={fileInputId}
              aria-label="上传参考图"
              aria-pressed={hasStep1References}
              title={
                step1ReferenceUploadDisabled && step1ReferenceImageDataUrls.length >= MAX_REFERENCE_IMAGES
                  ? `已达上限 ${MAX_REFERENCE_IMAGES} 张参考图`
                  : hasStep1References
                    ? `已添加 ${step1ReferenceImageDataUrls.length} 张参考图，点击可继续上传`
                    : "上传或粘贴参考图到输入区（最多5张）"
              }
              className={`text-lg font-bold ${step1CircleBtnClass(
                hasStep1References,
                step1ReferenceUploadDisabled
              )} ${step1ReferenceUploadDisabled ? "cursor-default" : "cursor-pointer"}`}
              onClick={(e) => e.stopPropagation()}
            >
              +
            </label>

            <div className="relative">
              <button
                type="button"
                disabled={isGenerating}
                aria-haspopup="listbox"
                aria-expanded={toolbarMenuOpen === "model"}
                aria-pressed={step1BananaImageModel === "banana-pro"}
                aria-label="生图模型：Banana pro 或 Banana 2（老张）"
                title={
                  step1BananaImageModel === "banana-2"
                    ? "当前 Banana 2，点击更换"
                    : "当前 Banana pro，点击更换"
                }
                className={step1CircleBtnClass(step1BananaImageModel === "banana-pro", isGenerating)}
                onClick={(e) => {
                  e.stopPropagation();
                  setToolbarMenuOpen((m) => (m === "model" ? null : "model"));
                }}
              >
                <IconStep1Brain className="shrink-0" />
              </button>
              {toolbarMenuOpen === "model" && !isGenerating ? (
                <div
                  role="listbox"
                  aria-label="选择生图模型"
                  className={STEP1_MODEL_MENU_PANEL}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={step1BananaImageModel === "banana-pro"}
                    className={`block w-full whitespace-nowrap px-3 py-2 text-left text-sm transition ${
                      step1BananaImageModel === "banana-pro"
                        ? "bg-amber-50 font-semibold text-amber-900"
                        : "text-[#363028] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_12%,var(--create-surface-paper))]"
                    }`}
                    onClick={() => {
                      setStep1BananaImageModel("banana-pro");
                      setToolbarMenuOpen(null);
                    }}
                  >
                    Banana pro
                  </button>
                  <button
                    type="button"
                    role="option"
                    aria-selected={step1BananaImageModel === "banana-2"}
                    className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm text-[#363028] transition hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_12%,var(--create-surface-paper))]"
                    onClick={() => {
                      setStep1BananaImageModel("banana-2");
                      setToolbarMenuOpen(null);
                    }}
                  >
                    Banana 2
                  </button>
                </div>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                disabled={isGenerating}
                aria-haspopup="listbox"
                aria-expanded={toolbarMenuOpen === "count"}
                aria-label={`生图数量 ${count}`}
                title={`生图数量：${count}`}
                className={step1CircleBtnClass(count !== 1, isGenerating)}
                onClick={(e) => {
                  e.stopPropagation();
                  setToolbarMenuOpen((m) => (m === "count" ? null : "count"));
                }}
              >
                <span className="text-sm font-semibold tabular-nums leading-none">{count}</span>
              </button>
              {toolbarMenuOpen === "count" && !isGenerating ? (
                <div
                  role="listbox"
                  aria-label="选择数量"
                  className={STEP1_MENU_PANEL}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="option"
                      aria-selected={count === n}
                      className={`w-full px-3 py-2 text-left text-sm tabular-nums transition ${
                        count === n
                          ? "bg-amber-50 font-semibold text-amber-900"
                          : "text-[#363028] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_12%,var(--create-surface-paper))]"
                      }`}
                      onClick={() => {
                        setCount(n);
                        setToolbarMenuOpen(null);
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              disabled={isGenerating}
              aria-pressed={step1ExpansionStrength === "strong"}
              aria-label={step1ExpansionStrength === "strong" ? "AI强创意" : "标准创意"}
              title={
                step1ExpansionStrength === "strong"
                  ? "AI强创意，点击切换为标准创意"
                  : "标准创意，点击切换为 AI强创意"
              }
              className={step1CircleBtnClass(step1ExpansionStrength === "strong", isGenerating)}
              onClick={(e) => {
                e.stopPropagation();
                setStep1ExpansionStrength(
                  step1ExpansionStrength === "strong" ? "standard" : "strong"
                );
              }}
            >
              <IconStep1CreativeLightbulb className="shrink-0" />
            </button>

            <button
              type="button"
              disabled={isGenerating}
              aria-pressed={!step1FastMode}
              aria-label={step1FastMode ? "极速模式（2K）" : "高清模式（4K）"}
              title={
                step1FastMode
                  ? "当前为极速模式（2K），点击切换为高清模式（4K）"
                  : "当前为高清模式（4K），点击切换为极速模式（2K）"
              }
              className={step1CircleBtnClass(!step1FastMode, isGenerating)}
              onClick={(e) => {
                e.stopPropagation();
                setStep1FastMode(!step1FastMode);
              }}
            >
              <ResolutionToggleIcon speed2k={step1FastMode} className="shrink-0" />
            </button>

            {step1ReferenceImageDataUrls.length > 0 ? (
              <button
                type="button"
                disabled={isGenerating}
                aria-label="清空所有提示图"
                title="清空所有提示图"
                className={`${STEP1_CIRCLE_BTN_BASE} border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:pointer-events-none disabled:opacity-50`}
                onClick={(e) => {
                  e.stopPropagation();
                  clearStep1ReferenceImages();
                  setUploadHint(null);
                }}
              >
                <IconStep1ClearReference className="shrink-0" />
              </button>
            ) : null}
          </div>

          <div className="ml-auto flex shrink-0 items-start">
            <Step1GenerateButton />
          </div>
        </div>

        {isGenerating ? (
          <div className="mt-3 flex w-full justify-center">
            <Step1FlipClock totalSeconds={Math.floor(step1GenElapsedMs / 1000)} />
          </div>
        ) : null}
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </div>
  );
}

