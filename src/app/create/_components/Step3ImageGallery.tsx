"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { useJewelryGeneratorStore, type GalleryImage } from "@/store/jewelryGeneratorStore";
import ImagePreviewModal from "./ImagePreviewModal";
import BrandButton from "./BrandButton";
import WindowedMount from "./WindowedMount";
import { emitToast } from "@/lib/ui/toast";
import { downloadImage } from "@/lib/ui/downloadImage";
import { applyStep1ReferenceFromGalleryUrl } from "@/lib/ui/applyStep1ReferenceFromGalleryUrl";
import { CREATE_STEP_PAPER } from "./createStepShell";
import { step1CircleBtnClass } from "./createToolbarCircleButton";
import { IconStep2Favorites, IconStep2History } from "./step2ToolbarIcons";

const STEP3_LAYOUT_STORAGE_KEY = "jewelry-step3-layout-v1";
const STEP3_LAYOUT_DEBUG_KEY = "STEP3_LAYOUT_DEBUG";
const THUMB_PREVIEW_BATCH_SIZE = 8;
const THUMB_MAX_WIDTH = 220;
const THUMB_WEBP_QUALITY = 0.72;
const STEP3_WINDOWED_GROUP_ESTIMATED_HEIGHT = 360;
type DetachedInsertMeta = { anchorGroupKey: string; position: "before" | "after" };
type ThumbWorkerReq = { id: number; src: string; maxW: number; quality: number };
type ThumbWorkerRes = { id: number; url: string; error?: string };

function getDataUrlExt(url: string): string {
  // url: data:image/png;base64,....
  if (url.startsWith("data:image/svg+xml")) return "svg";
  if (url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg")) return "jpg";
  if (url.startsWith("data:image/webp")) return "webp";
  return "png";
}

/** 指针拖拽时根据悬停元素更新 Step3 高亮（与放置优先级一致）。 */
function pickStep3DropHighlight(clientX: number, clientY: number): {
  heroGk: string | null;
  colGk: string | null;
  side: "left" | "right";
} {
  const side: "left" | "right" = clientX < window.innerWidth / 2 ? "left" : "right";
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const raw of stack) {
    if (!(raw instanceof HTMLElement)) continue;
    if (raw.closest("[data-step1-reference-dropzone]")) {
      return { heroGk: null, colGk: null, side };
    }
    if (raw.closest("[data-step3-extract-rail]")) {
      return { heroGk: null, colGk: null, side };
    }
    if (raw.closest("[data-step3-thumb-slot]")) {
      return { heroGk: null, colGk: null, side };
    }
    const hd = raw.closest("[data-step3-hero-drop]");
    if (hd) {
      const k = hd.getAttribute("data-step3-hero-drop");
      if (k) return { heroGk: k, colGk: null, side };
    }
    const cd = raw.closest("[data-step3-thumb-col-drop]");
    if (cd) {
      const k = cd.getAttribute("data-step3-thumb-col-drop");
      if (k) return { heroGk: null, colGk: k, side };
    }
  }
  return { heroGk: null, colGk: null, side };
}

function galleryTypeLabel(type: string): string {
  const map: Record<string, string> = {
    main: "主视图",
    on_model: "穿戴图",
    left: "左侧视图",
    right: "右侧视图",
    rear: "后视图",
    front: "正视图",
    top: "俯视图（旧）",
    side: "侧视图（旧）",
  };
  return map[type] ?? type;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] || "application/octet-stream";
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
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

function getImageInstanceKey(img: {
  id: string;
  setId?: string;
  setCreatedAt?: string;
  sourceMainImageId: string;
  type: string;
  createdAt?: string;
  url: string;
}): string {
  const urlSig = `${img.url.length}:${img.url.slice(-72)}`;
  return [
    img.id,
    img.setId ?? "no_set",
    img.setCreatedAt ?? "",
    img.sourceMainImageId,
    img.type,
    img.createdAt ?? "",
    urlSig,
  ].join("::");
}

/** 左侧主图 + 右侧全部副图 + 拖入本组的图，用于整组删除 */
function collectStep3GroupInstanceKeys(g: {
  displayHero: GalleryImage;
  displayThumbs: GalleryImage[];
  movedIn: GalleryImage[];
}): string[] {
  const keys = new Set<string>();
  keys.add(getImageInstanceKey(g.displayHero));
  for (const t of g.displayThumbs) keys.add(getImageInstanceKey(t));
  for (const m of g.movedIn) keys.add(getImageInstanceKey(m));
  return [...keys];
}

function parseGalleryTime(iso?: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * 无 setId 时若统一用 `no_set::sourceMainImageId`，同一主图下所有 Step3 历史会并成一组，
 * 侧栏出现大量叠在一起的缩略图（看起来像「重复生成」）。
 * 按时间排序，以新的 `main` 卡片作为一批次的起点拆分 legacy 组键。
 */
function missingSetIdGroupFullKeyByInstanceKey(images: GalleryImage[]): Map<string, string> {
  const out = new Map<string, string>();
  const noSet = images.filter((x) => !x.setId || !String(x.setId).trim());
  if (!noSet.length) return out;

  const sorted = [...noSet].sort(
    (a, b) => parseGalleryTime(a.createdAt) - parseGalleryTime(b.createdAt)
  );

  let seq = 0;
  let batch: GalleryImage[] = [];
  const flush = () => {
    if (!batch.length) return;
    const first = batch[0]!;
    const root = `legacy_${first.sourceMainImageId}_${parseGalleryTime(first.createdAt)}_${seq}`;
    const fullKey = `${root}::${first.sourceMainImageId}`;
    for (const im of batch) {
      out.set(getImageInstanceKey(im), fullKey);
    }
    seq += 1;
    batch = [];
  };

  for (const img of sorted) {
    if (img.type === "main" && batch.length > 0) {
      flush();
    }
    batch.push(img);
  }
  flush();
  return out;
}

function step3DisplayGroupKey(
  img: GalleryImage,
  legacyGroupFullByInstanceKey: Map<string, string>
): string {
  if (img.setId && String(img.setId).trim()) {
    return `${img.setId}::${img.sourceMainImageId}`;
  }
  return (
    legacyGroupFullByInstanceKey.get(getImageInstanceKey(img)) ??
    `legacy_orphan::${img.id}::${img.sourceMainImageId}`
  );
}

async function buildThumbDataUrlOnMainThread(
  src: string,
  maxW = THUMB_MAX_WIDTH,
  quality = THUMB_WEBP_QUALITY
): Promise<string> {
  if (typeof window === "undefined") return src;
  if (!src.startsWith("data:image/")) return src;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  const ratio = img.width > 0 ? img.height / img.width : 1;
  const w = Math.max(60, Math.min(maxW, img.width || maxW));
  const h = Math.max(45, Math.round(w * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/webp", quality);
}

export default function Step3ImageGallery() {
  const {
    galleryImages,
    galleryHistoryImages,
    status,
    regenerateGalleryImage,
    deleteGalleryHistoryImagesBySelectors,
    toggleGalleryHistoryFavoriteBySelector,
  } = useJewelryGeneratorStore();

  const [viewMode, setViewMode] = useState<"current" | "history" | "favorites">("current");
  /** 跨组拖拽/抽出条：此前误限定为仅「历史」视图，导致默认「当前」下无法操作 */
  const step3LayoutDragEnabled =
    viewMode === "current" || viewMode === "history" || viewMode === "favorites";

  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const [isZipping, setIsZipping] = useState(false);

  // 用于“多选下载ZIP / 历史删除”（按实例键，避免历史重复 id 串选）
  const [selectedImageKeys, setSelectedImageKeys] = useState<string[]>([]);

  const [previewItems, setPreviewItems] = useState<Array<{ instanceKey?: string; id?: string; url: string; alt: string }>>([]);
  const [previewIndex, setPreviewIndex] = useState<number>(0);

  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptModalText, setPromptModalText] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState<
    null | { keys: string[]; scope: "selection" | "group" }
  >(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [draggingImageKey, setDraggingImageKey] = useState<string | null>(null);
  const [dropTargetGroupKey, setDropTargetGroupKey] = useState<string | null>(null);
  const [heroDropTargetGroupKey, setHeroDropTargetGroupKey] = useState<string | null>(null);
  const [movedImageTargetGroupByKey, setMovedImageTargetGroupByKey] = useState<Record<string, string>>({});
  const [heroOverrideByGroupKey, setHeroOverrideByGroupKey] = useState<Record<string, string>>({});
  const [detachedHeroKeys, setDetachedHeroKeys] = useState<string[]>([]);
  const [detachedInsertMetaByGroupKey, setDetachedInsertMetaByGroupKey] = useState<Record<string, DetachedInsertMeta>>({});
  const [thumbOrderByGroupKey, setThumbOrderByGroupKey] = useState<Record<string, string[]>>({});
  const [externalDropSide, setExternalDropSide] = useState<"left" | "right">("right");
  const [armedImageKey, setArmedImageKey] = useState<string | null>(null);
  const [skipClickImageKey, setSkipClickImageKey] = useState<string | null>(null);
  const armHoldTimerRef = useRef<number | null>(null);
  const armExpireTimerRef = useRef<number | null>(null);
  const layoutHydratedRef = useRef(false);
  const imagesHydratedRef = useRef(false);
  const debugEnabledRef = useRef(false);
  const [hoveredStackCardKey, setHoveredStackCardKey] = useState<string | null>(null);
  const [extractedStackCardKey, setExtractedStackCardKey] = useState<string | null>(null);
  const extractTimerRef = useRef<number | null>(null);
  const [thumbUrlByKey, setThumbUrlByKey] = useState<Record<string, string>>({});
  const thumbUrlByKeyRef = useRef<Record<string, string>>({});
  const thumbWorkerRef = useRef<Worker | null>(null);
  const thumbWorkerSeqRef = useRef(1);
  const thumbWorkerPendingRef = useRef<
    Map<number, { resolve: (url: string) => void; reject: (e: unknown) => void }>
  >(new Map());
  const armedImageKeyRef = useRef<string | null>(null);
  const step3PointerSessionRef = useRef<{
    key: string;
    url: string;
    startX: number;
    startY: number;
    pointerId: number;
    active: boolean;
    ghost: HTMLDivElement | null;
    edgeTimer: number | null;
    edgePointerY: number;
  } | null>(null);
  const pointerDropResolverRef = useRef<
    (clientX: number, clientY: number, droppedKey: string, imageUrl: string) => void
  >(() => undefined);

  useEffect(() => {
    armedImageKeyRef.current = armedImageKey;
  }, [armedImageKey]);

  useEffect(() => {
    thumbUrlByKeyRef.current = thumbUrlByKey;
  }, [thumbUrlByKey]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof Worker === "undefined") return;
    try {
      const worker = new Worker(
        new URL("../../../workers/thumbDataUrl.worker.ts", import.meta.url),
        { type: "module" }
      );
      thumbWorkerRef.current = worker;
      worker.onmessage = (ev: MessageEvent<ThumbWorkerRes>) => {
        const { id, url } = ev.data;
        const pending = thumbWorkerPendingRef.current.get(id);
        if (!pending) return;
        thumbWorkerPendingRef.current.delete(id);
        pending.resolve(url);
      };
      worker.onerror = (e) => {
        const err = e instanceof ErrorEvent ? e.error ?? e.message : e;
        for (const [, pending] of thumbWorkerPendingRef.current.entries()) {
          pending.reject(err);
        }
        thumbWorkerPendingRef.current.clear();
      };
    } catch {
      thumbWorkerRef.current = null;
    }

    return () => {
      const worker = thumbWorkerRef.current;
      thumbWorkerRef.current = null;
      if (worker) worker.terminate();
      for (const [, pending] of thumbWorkerPendingRef.current.entries()) {
        pending.reject(new Error("thumb worker disposed"));
      }
      thumbWorkerPendingRef.current.clear();
    };
  }, []);

  const buildThumbDataUrl = useCallback(async (src: string): Promise<string> => {
    const worker = thumbWorkerRef.current;
    if (!worker) {
      return buildThumbDataUrlOnMainThread(src, THUMB_MAX_WIDTH, THUMB_WEBP_QUALITY);
    }
    return new Promise<string>((resolve, reject) => {
      const id = thumbWorkerSeqRef.current++;
      thumbWorkerPendingRef.current.set(id, { resolve, reject });
      try {
        const payload: ThumbWorkerReq = {
          id,
          src,
          maxW: THUMB_MAX_WIDTH,
          quality: THUMB_WEBP_QUALITY,
        };
        worker.postMessage(payload);
      } catch (err) {
        thumbWorkerPendingRef.current.delete(id);
        reject(err);
      }
    });
  }, []);

  const displayImages = useMemo(() => {
    if (viewMode === "history") {
      // Step3 历史显示不依赖 Step2 当前选择：直接展示全部历史生成结果。
      if (!galleryHistoryImages.length) return [];
      return galleryHistoryImages;
    }
    if (viewMode === "favorites") {
      return galleryHistoryImages.filter((x) => !!x.isFavorite);
    }

    // 关键：不再使用 Step2 主图兜底展示，避免在你未点击“生成展示图组合”前 Step3 提前显示结果。
    return galleryImages;
  }, [galleryImages, galleryHistoryImages, viewMode]);

  const allKnownImages = useMemo(() => {
    const all = [...galleryHistoryImages, ...galleryImages];
    const map = new Map<string, (typeof all)[number]>();
    for (const img of all) map.set(getImageInstanceKey(img), img);
    return Array.from(map.values());
  }, [galleryHistoryImages, galleryImages]);

  const imageByKey = useMemo(() => {
    const map: Record<string, (typeof allKnownImages)[number]> = {};
    for (const img of allKnownImages) map[getImageInstanceKey(img)] = img;
    return map;
  }, [allKnownImages]);

  useEffect(() => {
    const keys = new Set(displayImages.map((x) => getImageInstanceKey(x)));
    setSelectedImageKeys((prev) => prev.filter((k) => keys.has(k)));
  }, [displayImages]);

  useEffect(() => {
    const keys = new Set(displayImages.map((x) => getImageInstanceKey(x)));
    setThumbUrlByKey((prev) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (keys.has(k)) next[k] = v;
      }
      return next;
    });
  }, [displayImages]);

  useEffect(() => {
    let cancelled = false;
    const queue = displayImages.filter((img) => {
      const key = getImageInstanceKey(img);
      return !thumbUrlByKeyRef.current[key];
    });
    if (!queue.length) return;
    (async () => {
      let pending: Record<string, string> = {};
      const flushPending = () => {
        const next = pending;
        pending = {};
        if (!Object.keys(next).length) return;
        setThumbUrlByKey((prev) => ({ ...prev, ...next }));
        thumbUrlByKeyRef.current = { ...thumbUrlByKeyRef.current, ...next };
      };
      for (const img of queue) {
        if (cancelled) return;
        const key = getImageInstanceKey(img);
        try {
          const thumb = await buildThumbDataUrl(img.url);
          if (cancelled) return;
          if (!thumbUrlByKeyRef.current[key] && !pending[key]) {
            pending[key] = thumb;
          }
        } catch {
          if (cancelled) return;
          if (!thumbUrlByKeyRef.current[key] && !pending[key]) {
            pending[key] = img.url;
          }
        }
        if (Object.keys(pending).length >= THUMB_PREVIEW_BATCH_SIZE) {
          flushPending();
        }
      }
      flushPending();
    })();
    return () => {
      cancelled = true;
    };
  }, [buildThumbDataUrl, displayImages]);

  useEffect(() => {
    return () => {
      if (extractTimerRef.current !== null) window.clearTimeout(extractTimerRef.current);
      if (armHoldTimerRef.current !== null) window.clearTimeout(armHoldTimerRef.current);
      if (armExpireTimerRef.current !== null) window.clearTimeout(armExpireTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const localFlag = window.localStorage.getItem(STEP3_LAYOUT_DEBUG_KEY);
    const globalFlag = (window as typeof window & { __STEP3_LAYOUT_DEBUG__?: boolean }).__STEP3_LAYOUT_DEBUG__;
    debugEnabledRef.current = localFlag === "1" || localFlag === "true" || globalFlag === true;
    if (debugEnabledRef.current) {
      console.info("[Step3Layout][debug] enabled");
    }
  }, []);

  const debugSnapshot = (tag: string, extra?: Record<string, unknown>) => {
    if (!debugEnabledRef.current) return;
    console.info("[Step3Layout]", tag, {
      movedCount: Object.keys(movedImageTargetGroupByKey).length,
      heroOverrideCount: Object.keys(heroOverrideByGroupKey).length,
      detachedCount: detachedHeroKeys.length,
      detachedInsertCount: Object.keys(detachedInsertMetaByGroupKey).length,
      thumbOrderGroupCount: Object.keys(thumbOrderByGroupKey).length,
      displayImageCount: displayImages.length,
      ...extra,
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STEP3_LAYOUT_STORAGE_KEY);
      if (debugEnabledRef.current) {
        console.info("[Step3Layout] hydrate raw", {
          hasRaw: !!raw,
          rawLength: raw?.length ?? 0,
          rawPreview: raw ? raw.slice(0, 220) : "",
        });
      }
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        movedImageTargetGroupByKey?: Record<string, string>;
        heroOverrideByGroupKey?: Record<string, string>;
        detachedHeroKeys?: string[];
        detachedInsertMetaByGroupKey?: Record<string, DetachedInsertMeta>;
        thumbOrderByGroupKey?: Record<string, string[]>;
      };
      if (parsed.movedImageTargetGroupByKey) setMovedImageTargetGroupByKey(parsed.movedImageTargetGroupByKey);
      if (parsed.heroOverrideByGroupKey) setHeroOverrideByGroupKey(parsed.heroOverrideByGroupKey);
      if (Array.isArray(parsed.detachedHeroKeys)) setDetachedHeroKeys(parsed.detachedHeroKeys);
      if (parsed.detachedInsertMetaByGroupKey) setDetachedInsertMetaByGroupKey(parsed.detachedInsertMetaByGroupKey);
      if (parsed.thumbOrderByGroupKey) setThumbOrderByGroupKey(parsed.thumbOrderByGroupKey);
      if (debugEnabledRef.current) {
        console.info("[Step3Layout] hydrate parsed", {
          movedCount: Object.keys(parsed.movedImageTargetGroupByKey ?? {}).length,
          heroOverrideCount: Object.keys(parsed.heroOverrideByGroupKey ?? {}).length,
          detachedCount: (parsed.detachedHeroKeys ?? []).length,
          detachedInsertCount: Object.keys(parsed.detachedInsertMetaByGroupKey ?? {}).length,
          thumbOrderGroupCount: Object.keys(parsed.thumbOrderByGroupKey ?? {}).length,
        });
      }
    } catch {
      // ignore corrupted local storage
      if (debugEnabledRef.current) {
        console.warn("[Step3Layout] hydrate parse failed");
      }
    } finally {
      layoutHydratedRef.current = true;
      debugSnapshot("hydrate complete");
    }
  }, []);

  useEffect(() => {
    if (allKnownImages.length > 0) {
      imagesHydratedRef.current = true;
    }
  }, [allKnownImages.length]);

  useEffect(() => {
    const keys = new Set(allKnownImages.map((x) => getImageInstanceKey(x)));
    if (!keys.size) {
      if (debugEnabledRef.current) {
        console.info("[Step3Layout] skip prune: images not ready");
      }
      return;
    }
    setMovedImageTargetGroupByKey((prev) => {
      const next: Record<string, string> = {};
      for (const [imgKey, targetKey] of Object.entries(prev)) {
        if (keys.has(imgKey)) next[imgKey] = targetKey;
      }
      if (debugEnabledRef.current && Object.keys(prev).length !== Object.keys(next).length) {
        console.info("[Step3Layout] prune moved map", {
          before: Object.keys(prev).length,
          after: Object.keys(next).length,
        });
      }
      return next;
    });
    setDetachedHeroKeys((prev) => prev.filter((k) => keys.has(k)));
    setDetachedInsertMetaByGroupKey((prev) => {
      const next: Record<string, DetachedInsertMeta> = {};
      for (const [groupKey, meta] of Object.entries(prev)) {
        const heroKey = groupKey.replace(/^detached::/, "");
        if (keys.has(heroKey)) next[groupKey] = meta;
      }
      return next;
    });
    setThumbOrderByGroupKey((prev) => {
      const next: Record<string, string[]> = {};
      for (const [groupKey, arr] of Object.entries(prev)) {
        const kept = arr.filter((k) => keys.has(k));
        if (kept.length) next[groupKey] = kept;
      }
      if (debugEnabledRef.current && Object.keys(prev).length !== Object.keys(next).length) {
        console.info("[Step3Layout] prune thumb orders", {
          before: Object.keys(prev).length,
          after: Object.keys(next).length,
        });
      }
      return next;
    });
  }, [allKnownImages]);

  useEffect(() => {
    const keys = new Set(displayImages.map((x) => getImageInstanceKey(x)));
    setHeroOverrideByGroupKey((prev) => {
      const next: Record<string, string> = {};
      for (const [groupKey, imageKey] of Object.entries(prev)) {
        if (keys.has(imageKey)) next[groupKey] = imageKey;
      }
      return next;
    });
  }, [displayImages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!layoutHydratedRef.current) return;
    if (!imagesHydratedRef.current) {
      if (debugEnabledRef.current) {
        console.info("[Step3Layout] skip persist: images not hydrated yet");
      }
      return;
    }
    try {
      debugSnapshot("persist write start");
      window.localStorage.setItem(
        STEP3_LAYOUT_STORAGE_KEY,
        JSON.stringify({
          movedImageTargetGroupByKey,
          heroOverrideByGroupKey,
          detachedHeroKeys,
          detachedInsertMetaByGroupKey,
          thumbOrderByGroupKey,
        })
      );
      debugSnapshot("persist write done");
    } catch {
      // ignore storage quota errors
      if (debugEnabledRef.current) {
        console.warn("[Step3Layout] persist write failed");
      }
    }
  }, [
    movedImageTargetGroupByKey,
    heroOverrideByGroupKey,
    detachedHeroKeys,
    detachedInsertMetaByGroupKey,
    thumbOrderByGroupKey,
  ]);

  const historyTotals = useMemo(() => {
    const total = galleryHistoryImages.length;
    return { total, matched: total };
  }, [galleryHistoryImages]);

  const handleDownloadSelected = async () => {
    if (isZipping) return;
    if (!selectedImageKeys.length) return;
    if (!displayImages.length) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();

      const selected = selectedImageKeys.map((k) => imageByKey[k]).filter((x): x is (typeof displayImages)[number] => !!x);

      if (!selected.length) return;

      for (const img of selected) {
        const ext = getDataUrlExt(img.url);
        const filename = `${img.type}_${img.id}.${ext}`;
        zip.file(filename, dataUrlToBlob(img.url));
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(zipBlob);
      await downloadImage(zipUrl, `step3_selected_${new Date().toISOString().slice(0, 10)}.zip`);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
    } catch (e) {
      console.error("Zip selected download failed:", e);
    } finally {
      setIsZipping(false);
    }
  };

  const canShow = displayImages.length > 0;
  const hasCustomLayout =
    Object.keys(movedImageTargetGroupByKey).length > 0 ||
    Object.keys(heroOverrideByGroupKey).length > 0 ||
    detachedHeroKeys.length > 0 ||
    Object.keys(detachedInsertMetaByGroupKey).length > 0 ||
    Object.keys(thumbOrderByGroupKey).length > 0;

  const toggleSelected = (imageKey: string) => {
    setSelectedImageKeys((prev) =>
      prev.includes(imageKey) ? prev.filter((x) => x !== imageKey) : [imageKey, ...prev]
    );
  };

  const armExtractPreview = (imageKey: string) => {
    setHoveredStackCardKey(imageKey);
    if (extractTimerRef.current !== null) {
      window.clearTimeout(extractTimerRef.current);
      extractTimerRef.current = null;
    }
    setExtractedStackCardKey(imageKey);
  };

  const clearExtractPreview = () => {
    setHoveredStackCardKey(null);
    if (extractTimerRef.current !== null) {
      window.clearTimeout(extractTimerRef.current);
      extractTimerRef.current = null;
    }
    setExtractedStackCardKey(null);
  };

  const ensureGroupThumbOrder = (groupKey: string, thumbs: Array<{ id: string; setId?: string; sourceMainImageId: string; type: string; createdAt?: string; url: string }>) => {
    const fallback = thumbs.map((x) => getImageInstanceKey(x));
    const existing = thumbOrderByGroupKey[groupKey] ?? [];
    const validExisting = existing.filter((k) => fallback.includes(k));
    const missing = fallback.filter((k) => !validExisting.includes(k));
    return [...validExisting, ...missing];
  };

  const startArmHold = (imageKey: string) => {
    if (!step3LayoutDragEnabled) return;
    if (armHoldTimerRef.current !== null) window.clearTimeout(armHoldTimerRef.current);
    armHoldTimerRef.current = window.setTimeout(() => {
      setArmedImageKey(imageKey);
      setSkipClickImageKey(imageKey);
      emitToast({ message: "已解锁，可拖拽 2 秒", type: "info", durationMs: 1200 });
      if (armExpireTimerRef.current !== null) window.clearTimeout(armExpireTimerRef.current);
      armExpireTimerRef.current = window.setTimeout(() => {
        setArmedImageKey((k) => (k === imageKey ? null : k));
      }, 2000);
    }, 250);
  };

  const cancelArmHold = () => {
    if (armHoldTimerRef.current !== null) {
      window.clearTimeout(armHoldTimerRef.current);
      armHoldTimerRef.current = null;
    }
  };

  const step3GroupKeyContext = useMemo(() => {
    const legacyGroupFullByInstanceKey = missingSetIdGroupFullKeyByInstanceKey(displayImages);
    const originalGroupKeyByImageKey: Record<string, string> = {};
    for (const img of displayImages) {
      originalGroupKeyByImageKey[getImageInstanceKey(img)] = step3DisplayGroupKey(
        img,
        legacyGroupFullByInstanceKey
      );
    }
    return { legacyGroupFullByInstanceKey, originalGroupKeyByImageKey };
  }, [displayImages]);

  const detachedGroupKeyFor = (imageKey: string) => `detached::${imageKey}`;

  // 组合显示：每组 = (setId + sourceMainImageId)，左侧主大图，右侧竖排小视角
  const groupedSets = useMemo(() => {
    const order = (t: string) => {
      if (t === "main") return 0;
      if (t === "on_model") return 1;
      if (t === "front" || t === "top") return 2;
      if (t === "left" || t === "side") return 3;
      if (t === "right") return 4;
      if (t === "rear") return 5;
      return 9;
    };
    const map = new Map<string, { key: string; images: typeof displayImages }>();
    for (const img of displayImages) {
      const key = step3DisplayGroupKey(img, step3GroupKeyContext.legacyGroupFullByInstanceKey);
      if (movedImageTargetGroupByKey[getImageInstanceKey(img)]) continue;
      const found = map.get(key);
      if (found) found.images.push(img);
      else map.set(key, { key, images: [img] });
    }
    const baseGroups = Array.from(map.values())
      .map((g) => {
        const sorted = [...g.images].sort((a, b) => order(a.type) - order(b.type));
        const hero = sorted.find((x) => x.type === "main") ?? sorted[0];
        const thumbs = sorted.filter((x) => x.id !== hero?.id);
        const createdAt = hero?.createdAt ?? hero?.setCreatedAt ?? "";
        return { key: g.key, hero, thumbs, createdAt };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const mappedBase = baseGroups.map((g) => {
      const movedIn = Object.entries(movedImageTargetGroupByKey)
        .filter(([, targetKey]) => targetKey === g.key)
        .map(([imgKey]) => imageByKey[imgKey])
        .filter((x): x is (typeof displayImages)[number] => !!x);
      const candidateKey = heroOverrideByGroupKey[g.key];
      const candidateBelongsToGroup =
        !!candidateKey &&
        (step3GroupKeyContext.originalGroupKeyByImageKey[candidateKey] === g.key ||
          movedImageTargetGroupByKey[candidateKey] === g.key);
      const candidate = candidateBelongsToGroup && candidateKey ? imageByKey[candidateKey] : null;
      const displayHero = candidate ?? g.hero;
      const displayThumbsRaw = [g.hero, ...g.thumbs, ...movedIn].filter(
        (x) => getImageInstanceKey(x) !== getImageInstanceKey(displayHero)
      );
      const order = thumbOrderByGroupKey[g.key] ?? [];
      const byKey: Record<string, (typeof displayImages)[number]> = {};
      for (const t of displayThumbsRaw) byKey[getImageInstanceKey(t)] = t;
      const ordered = order.map((k) => byKey[k]).filter((x): x is (typeof displayImages)[number] => !!x);
      const tail = displayThumbsRaw.filter((t) => !order.includes(getImageInstanceKey(t)));
      const displayThumbs = [...ordered, ...tail];
      return { ...g, movedIn, displayHero, displayThumbs };
    });

    const detachedGroups = detachedHeroKeys
      .map((imgKey) => {
        const img = imageByKey[imgKey];
        if (!img) return null;
        const key = detachedGroupKeyFor(imgKey);
        return {
          key,
          hero: img,
          thumbs: [] as typeof displayImages,
          movedIn: [] as typeof displayImages,
          displayHero: img,
          displayThumbs: [] as typeof displayImages,
          createdAt: img.createdAt ?? "",
          isDetached: true,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const result = [...mappedBase];
    for (const dg of detachedGroups) {
      const meta = detachedInsertMetaByGroupKey[dg.key];
      if (!meta) {
        result.push(dg);
        continue;
      }
      const anchorIdx = result.findIndex((x) => x.key === meta.anchorGroupKey);
      if (anchorIdx < 0) {
        result.push(dg);
        continue;
      }
      const insertIdx = meta.position === "before" ? anchorIdx : anchorIdx + 1;
      result.splice(insertIdx, 0, dg);
    }
    return result;
  }, [
    displayImages,
    imageByKey,
    movedImageTargetGroupByKey,
    heroOverrideByGroupKey,
    step3GroupKeyContext,
    detachedHeroKeys,
    detachedInsertMetaByGroupKey,
    thumbOrderByGroupKey,
  ]);

  pointerDropResolverRef.current = (clientX, clientY, droppedKey, imageUrl) => {
    if (!step3LayoutDragEnabled) return;
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const raw of stack) {
      if (!(raw instanceof HTMLElement)) continue;
      const el = raw;

      if (el.closest("[data-step1-reference-dropzone]")) {
        void applyStep1ReferenceFromGalleryUrl(imageUrl).then((r) => {
          if (r.ok) emitToast({ message: "已添加到参考图", type: "success", durationMs: 1200 });
          else emitToast({ message: r.hint, type: "error", durationMs: 2400 });
        });
        return;
      }

      if (el.closest("[data-step3-extract-rail]")) {
        const sourceGroupKey =
          movedImageTargetGroupByKey[droppedKey] ?? step3GroupKeyContext.originalGroupKeyByImageKey[droppedKey];
        if (!sourceGroupKey) continue;
        const side = clientX < window.innerWidth / 2 ? "left" : "right";
        const detachedKey = detachedGroupKeyFor(droppedKey);
        setMovedImageTargetGroupByKey((prev) => ({ ...prev, [droppedKey]: detachedKey }));
        setDetachedHeroKeys((prev) => (prev.includes(droppedKey) ? prev : [...prev, droppedKey]));
        setHeroOverrideByGroupKey((prev) => ({ ...prev, [detachedKey]: droppedKey }));
        setDetachedInsertMetaByGroupKey((prev) => ({
          ...prev,
          [detachedKey]: {
            anchorGroupKey: sourceGroupKey,
            position: side === "left" ? "before" : "after",
          },
        }));
        debugSnapshot("detach via side rail", { side, droppedKey, sourceGroupKey });
        emitToast({ message: "已抽出为新组合主图", type: "success", durationMs: 1200 });
        return;
      }

      const slot = el.closest("[data-step3-thumb-slot]");
      if (slot) {
        const targetKey = slot.getAttribute("data-thumb-key");
        const gk = slot.getAttribute("data-group-key");
        if (!targetKey || !gk || targetKey === droppedKey) continue;
        const g = groupedSets.find((x) => x.key === gk);
        if (!g) continue;
        const rightColThumbs = g.displayThumbs;
        const groupMemberKeys = new Set([
          getImageInstanceKey(g.displayHero),
          ...rightColThumbs.map((x) => getImageInstanceKey(x)),
        ]);
        if (!groupMemberKeys.has(droppedKey)) continue;
        setThumbOrderByGroupKey((prev) => {
          const base = ensureGroupThumbOrder(g.key, rightColThumbs);
          const from = base.indexOf(droppedKey);
          const to = base.indexOf(targetKey);
          if (from < 0 || to < 0) return prev;
          const next = [...base];
          [next[from], next[to]] = [next[to], next[from]];
          return { ...prev, [g.key]: next };
        });
        debugSnapshot("reorder thumbs");
        return;
      }

      const heroEl = el.closest("[data-step3-hero-drop]");
      if (heroEl) {
        const gkey = heroEl.getAttribute("data-step3-hero-drop");
        if (!gkey) continue;
        const g = groupedSets.find((x) => x.key === gkey);
        if (!g) continue;
        const rightColThumbs = g.displayThumbs;
        const groupMemberKeys = new Set([
          getImageInstanceKey(g.displayHero),
          ...rightColThumbs.map((x) => getImageInstanceKey(x)),
        ]);
        if (!groupMemberKeys.has(droppedKey)) continue;
        const inRight = rightColThumbs.some((x) => getImageInstanceKey(x) === droppedKey);
        if (!inRight) continue;
        setHeroOverrideByGroupKey((prev) => ({ ...prev, [g.key]: droppedKey }));
        debugSnapshot("swap hero", { groupKey: g.key, droppedKey });
        emitToast({ message: "已切换主图显示", type: "success", durationMs: 1000 });
        return;
      }

      const colEl = el.closest("[data-step3-thumb-col-drop]");
      if (colEl) {
        const gkey = colEl.getAttribute("data-step3-thumb-col-drop");
        if (!gkey) continue;
        const g = groupedSets.find((x) => x.key === gkey);
        if (!g) continue;
        const rightColThumbs = g.displayThumbs;
        const isDetachedGroup = g.key.startsWith("detached::");
        const existing = new Set([
          getImageInstanceKey(g.hero),
          ...g.thumbs.map((x) => getImageInstanceKey(x)),
          ...g.movedIn.map((x) => getImageInstanceKey(x)),
        ]);
        if (existing.has(droppedKey)) continue;
        const sourceKey = step3GroupKeyContext.originalGroupKeyByImageKey[droppedKey];
        const currentTarget = movedImageTargetGroupByKey[droppedKey] ?? sourceKey;
        if (currentTarget === g.key) continue;
        if (sourceKey === g.key) {
          setMovedImageTargetGroupByKey((prev) => {
            const next = { ...prev };
            delete next[droppedKey];
            return next;
          });
          setDetachedHeroKeys((prev) => prev.filter((k) => k !== droppedKey));
        } else {
          setMovedImageTargetGroupByKey((prev) => ({ ...prev, [droppedKey]: g.key }));
          setDetachedHeroKeys((prev) => prev.filter((k) => k !== droppedKey));
        }
        setThumbOrderByGroupKey((prev) => {
          const base = ensureGroupThumbOrder(g.key, rightColThumbs);
          const nextOrder = base.filter((k) => k !== droppedKey).concat(droppedKey);
          return { ...prev, [g.key]: nextOrder };
        });
        if (isDetachedGroup) {
          setHeroOverrideByGroupKey((prev) => ({ ...prev, [g.key]: droppedKey }));
        }
        debugSnapshot("move to group right column", {
          groupKey: g.key,
          droppedKey,
          sourceKey,
          currentTarget,
        });
        emitToast({ message: "已移动到该组合小视角", type: "success", durationMs: 1200 });
        return;
      }
    }
  };

  const beginStep3TilePointerDrag = (e: React.PointerEvent, imageKey: string, imageUrl: string) => {
    if (!step3LayoutDragEnabled || e.pointerType === "touch") return;
    if (e.button !== 0) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt?.closest("button")) return;
    if (step3PointerSessionRef.current) return;

    const session = {
      key: imageKey,
      url: imageUrl,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      active: false,
      ghost: null as HTMLDivElement | null,
      edgeTimer: null as number | null,
      edgePointerY: e.clientY,
    };
    step3PointerSessionRef.current = session;

    const stopEdge = () => {
      if (session.edgeTimer !== null) {
        window.clearInterval(session.edgeTimer);
        session.edgeTimer = null;
      }
    };

    const teardown = () => {
      stopEdge();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("wheel", onWheel, true);
      if (session.ghost?.parentNode) session.ghost.remove();
      session.ghost = null;
      step3PointerSessionRef.current = null;
    };

    const finishDrag = (clientX: number, clientY: number) => {
      const { key: dk, url: iu, active: wasActive } = session;
      teardown();
      setHeroDropTargetGroupKey(null);
      setDropTargetGroupKey(null);
      if (wasActive) {
        setDraggingImageKey(null);
        setArmedImageKey(null);
        if (armExpireTimerRef.current !== null) {
          window.clearTimeout(armExpireTimerRef.current);
          armExpireTimerRef.current = null;
        }
        pointerDropResolverRef.current(clientX, clientY, dk, iu);
      }
    };

    const onWheel = (ev: WheelEvent) => {
      if (!step3PointerSessionRef.current?.active) return;
      ev.preventDefault();
      ev.stopPropagation();
      let dy = ev.deltaY;
      if (ev.deltaMode === 1) dy *= 16;
      else if (ev.deltaMode === 2) dy *= window.innerHeight * 0.9;
      const root = document.scrollingElement ?? document.documentElement;
      root.scrollBy({ top: dy, behavior: "auto" });
    };

    const onMove = (ev: PointerEvent) => {
      const sess = step3PointerSessionRef.current;
      if (!sess || ev.pointerId !== sess.pointerId) return;
      sess.edgePointerY = ev.clientY;

      if (!armedImageKeyRef.current) return;

      const dx = ev.clientX - sess.startX;
      const dy = ev.clientY - sess.startY;
      if (!sess.active) {
        if (dx * dx + dy * dy < 49) return;
        sess.active = true;
        setDraggingImageKey(sess.key);
        if (armExpireTimerRef.current !== null) {
          window.clearTimeout(armExpireTimerRef.current);
          armExpireTimerRef.current = null;
        }
        const ghost = document.createElement("div");
        ghost.className =
          "pointer-events-none fixed z-[9999] h-28 w-28 overflow-hidden rounded-2xl border-2 border-white shadow-2xl ring-1 ring-black/10";
        const im = document.createElement("img");
        im.src = sess.url;
        im.className = "h-full w-full object-cover";
        im.draggable = false;
        im.alt = "";
        ghost.appendChild(im);
        document.body.appendChild(ghost);
        sess.ghost = ghost;
        ev.preventDefault();
      }

      if (sess.ghost) {
        sess.ghost.style.left = "0";
        sess.ghost.style.top = "0";
        sess.ghost.style.transform = `translate(${ev.clientX - 56}px, ${ev.clientY - 56}px)`;
      }

      const hi = pickStep3DropHighlight(ev.clientX, ev.clientY);
      setHeroDropTargetGroupKey(hi.heroGk);
      setDropTargetGroupKey(hi.colGk);
      setExternalDropSide(hi.side);

      if (sess.edgeTimer === null && sess.active) {
        sess.edgeTimer = window.setInterval(() => {
          const s = step3PointerSessionRef.current;
          if (!s?.active) return;
          const y = s.edgePointerY;
          const zone = 110;
          const speed = 28;
          const root = document.scrollingElement ?? document.documentElement;
          if (y < zone) root.scrollBy(0, -speed);
          else if (y > window.innerHeight - zone) root.scrollBy(0, speed);
        }, 16);
      }
    };

    const onUp = (ev: PointerEvent) => {
      const sess = step3PointerSessionRef.current;
      if (!sess || ev.pointerId !== sess.pointerId) return;
      if (!sess.active) {
        cancelArmHold();
        teardown();
        return;
      }
      finishDrag(ev.clientX, ev.clientY);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-lg font-bold text-gray-900 md:text-xl">Step 3：展示图显示</div>
        <div className="flex items-center gap-3">
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

          <BrandButton
            type="button"
            variant="outline"
            shape="full"
            disabled={!hasCustomLayout}
            onClick={() => {
              setMovedImageTargetGroupByKey({});
              setHeroOverrideByGroupKey({});
              setDetachedHeroKeys([]);
              setDetachedInsertMetaByGroupKey({});
              setThumbOrderByGroupKey({});
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(STEP3_LAYOUT_STORAGE_KEY);
              }
              emitToast({ message: "已重置 Step3 布局", type: "info", durationMs: 1200 });
            }}
            className="h-[34px] px-4 text-sm"
          >
            重置布局
          </BrandButton>

          <BrandButton
            type="button"
            variant="outline"
            shape="xl"
            disabled={status.step3Generating || isZipping || selectedImageKeys.length === 0}
            onClick={handleDownloadSelected}
            className="h-[34px] px-4 text-xs"
          >
            {isZipping ? "打包中..." : `下载选中（${selectedImageKeys.length}）`}
          </BrandButton>

          {viewMode !== "current" && selectedImageKeys.length ? (
            <BrandButton
              type="button"
              variant="danger"
              shape="xl"
              disabled={status.step3Generating || isZipping}
              onClick={() => {
                if (!selectedImageKeys.length) return;
                setConfirmDelete({ keys: [...selectedImageKeys], scope: "selection" });
              }}
              className="h-[34px] px-4 text-xs"
            >
              删除选中
            </BrandButton>
          ) : null}
        </div>
      </div>

      <div className={`${CREATE_STEP_PAPER} space-y-4`}>
      {canShow ? (
        <>
          <div
            className={[
              "grid grid-cols-1 gap-4 lg:grid-cols-2",
              step3LayoutDragEnabled && draggingImageKey
                ? "rounded-2xl border-2 border-dashed border-[#5E6F82]/25 p-2"
                : "",
            ].join(" ")}
          >
            {groupedSets.map((g) => {
              if (!g.displayHero) return null;
              const rightColThumbs = g.displayThumbs;
              const groupMemberKeys = new Set([
                getImageInstanceKey(g.displayHero),
                ...rightColThumbs.map((x) => getImageInstanceKey(x)),
              ]);
              const openPreview = (imgKey: string) => {
                if (skipClickImageKey === imgKey) {
                  setSkipClickImageKey(null);
                  return;
                }
                clearExtractPreview();
                const items = displayImages.map((x) => ({
                  instanceKey: getImageInstanceKey(x),
                  id: x.id,
                  url: x.url,
                  alt: galleryTypeLabel(x.type),
                }));
                const idx = items.findIndex((x) => x.instanceKey === imgKey);
                setPreviewItems(items);
                setPreviewIndex(idx >= 0 ? idx : 0);
              };

              const renderTile = (
                img: (typeof displayImages)[number],
                compact: boolean,
                groupBundle?: (typeof groupedSets)[number]
              ) => {
                const imageKey = getImageInstanceKey(img);
                const showDeleteWholeGroup =
                  !!groupBundle &&
                  !compact &&
                  viewMode !== "current" &&
                  getImageInstanceKey(groupBundle.displayHero) === imageKey;
                return (
                <div
                  key={imageKey}
                  className={[
                    "relative overflow-hidden rounded-2xl border border-[rgba(94,111,130,0.15)] bg-white/90",
                    "transition-all duration-200 ease-out",
                    step3LayoutDragEnabled && armedImageKey === imageKey ? "ring-2 ring-[#5E6F82] shadow-lg" : "",
                    compact ? "shadow-sm hover:-translate-y-1 hover:shadow-md" : "shadow-sm hover:-translate-y-0.5 hover:shadow-md",
                  ].join(" ")}
                  onClick={() => openPreview(imageKey)}
                  onDragStart={(e) => e.preventDefault()}
                  onPointerDown={(e) => {
                    startArmHold(imageKey);
                    beginStep3TilePointerDrag(e, imageKey, img.url);
                  }}
                  onMouseUp={cancelArmHold}
                  onMouseLeave={cancelArmHold}
                >
                  <div className={`bg-[#EEF2F5] ${compact ? "aspect-[4/3]" : "aspect-square"}`}>
                    <img
                      src={img.url}
                      alt={galleryTypeLabel(img.type)}
                      className="h-full w-full object-cover select-none"
                      style={{ WebkitUserDrag: "none" } as React.CSSProperties}
                      loading="lazy"
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                    />
                  </div>
                  {showDeleteWholeGroup && groupBundle ? (
                    <button
                      type="button"
                      aria-label="删除整组展示图"
                      title="删除整组（主图与全部副图）"
                      disabled={status.step3Generating}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete({
                          keys: collectStep3GroupInstanceKeys(groupBundle),
                          scope: "group",
                        });
                      }}
                      className="pointer-events-auto absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow-md ring-1 ring-red-700/30 transition hover:bg-red-700 disabled:opacity-50"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M8 8l8 8M16 8l-8 8"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  ) : null}
                  {!compact ? (
                    <button
                      type="button"
                      aria-label="选择图片"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelected(imageKey);
                      }}
                      className={[
                        "absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border backdrop-blur",
                        selectedImageKeys.includes(imageKey)
                          ? "border-amber-300 bg-amber-50"
                          : "border-gray-300 bg-white/90",
                      ].join(" ")}
                    >
                      {selectedImageKeys.includes(imageKey) ? (
                        <span className="text-[10px] font-bold text-amber-800">✓</span>
                      ) : null}
                    </button>
                  ) : null}
                  {!compact && img.debugPromptZh ? (
                    <button
                      type="button"
                      aria-label="查看该图片对应的提示词"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPromptModalText(img.debugPromptZh ?? "");
                        setShowPromptModal(true);
                      }}
                      className={[
                        "absolute right-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 ring-1 ring-gray-200 hover:bg-white backdrop-blur text-[10px]",
                        showDeleteWholeGroup ? "top-12 z-10" : "top-2",
                      ].join(" ")}
                    >
                      👁
                    </button>
                  ) : null}
                  {!compact ? (
                    <div className="pointer-events-auto absolute left-2 bottom-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await downloadImage(img.url, `${img.type}_${img.id}.${getDataUrlExt(img.url)}`);
                        } catch {
                          emitToast({ message: "下载失败：图片地址不可访问或跨域受限。", type: "error" });
                        }
                      }}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-800 ring-1 ring-gray-200 hover:bg-white"
                      aria-label="下载"
                    >
                      <span className="text-xs">↓</span>
                    </button>
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
                        "inline-flex h-7 w-7 items-center justify-center rounded-full ring-1 backdrop-blur",
                        copiedId === img.id ? "bg-green-600 text-white ring-green-600" : "bg-white/90 text-gray-700 ring-gray-200 hover:bg-white",
                      ].join(" ")}
                    >
                      {copiedId === img.id ? <span className="text-[10px] font-bold">✓</span> : <span className="text-xs">⎘</span>}
                    </button>
                    </div>
                  ) : null}
                  {!compact ? (
                    <div className="pointer-events-auto absolute right-2 bottom-2 flex items-center gap-1">
                    {viewMode !== "current" ? (
                      <button
                        type="button"
                        aria-label={img.isFavorite ? "取消收藏" : "收藏"}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGalleryHistoryFavoriteBySelector({
                            id: img.id,
                            setId: img.setId,
                            sourceMainImageId: img.sourceMainImageId,
                            type: img.type,
                            createdAt: img.createdAt,
                          });
                        }}
                        className={[
                          "inline-flex h-7 w-7 items-center justify-center rounded-full ring-1 backdrop-blur",
                          img.isFavorite
                            ? "border-amber-300 bg-amber-50 text-amber-800 ring-amber-300/70"
                            : "bg-white/90 text-[#5E6F82] ring-[#5E6F82]/30 hover:bg-white",
                        ].join(" ")}
                      >
                        ★
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label="重试这张展示图"
                      disabled={status.step3Generating || refreshingId === img.id}
                      onClick={async (e) => {
                        e.stopPropagation();
                        setViewMode("current");
                        setRefreshingId(img.id);
                        try {
                          await regenerateGalleryImage(img.id);
                        } finally {
                          setRefreshingId(null);
                        }
                      }}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#5E6F82] ring-1 ring-[#5E6F82]/30 hover:bg-white backdrop-blur disabled:opacity-50"
                    >
                      {refreshingId === img.id ? <span className="inline-block animate-spin text-xs">↻</span> : <span className="text-xs">↻</span>}
                    </button>
                    </div>
                  ) : null}
                </div>
              );
              };

              return (
                <WindowedMount
                  key={g.key}
                  estimatedHeight={STEP3_WINDOWED_GROUP_ESTIMATED_HEIGHT}
                  enabled={viewMode !== "current"}
                >
                <div data-step3-group-card="1" className="rounded-2xl border border-[rgba(94,111,130,0.12)] bg-white/60 p-2 shadow-sm">
                  <div className="grid grid-cols-[1fr_110px] gap-2">
                    <div
                      data-step3-hero-drop={g.key}
                      className={[
                        "rounded-2xl",
                        step3LayoutDragEnabled && heroDropTargetGroupKey === g.key ? "ring-2 ring-[#5E6F82]/35" : "",
                      ].join(" ")}
                    >
                      {renderTile(g.displayHero, false, g)}
                    </div>
                    <div
                      data-step3-thumb-col-drop={g.key}
                      className={[
                        "rounded-xl p-1",
                        step3LayoutDragEnabled && dropTargetGroupKey === g.key
                          ? "bg-[#5E6F82]/8 ring-2 ring-[#5E6F82]/35"
                          : "",
                      ].join(" ")}
                      onMouseLeave={clearExtractPreview}
                    >
                      {rightColThumbs.length ? (
                        rightColThumbs.length <= 4 ? (
                          <div className="flex min-h-[88px] flex-col gap-2">
                            {rightColThumbs.map((img) => {
                              const key = getImageInstanceKey(img);
                              return (
                                <div
                                  key={key}
                                  className={[
                                    "relative cursor-pointer rounded-xl border border-[rgba(94,111,130,0.16)] bg-white/95 shadow-sm transition-all duration-200 ease-out hover:-translate-y-2.5 hover:scale-[1.035] hover:shadow-lg",
                                    step3LayoutDragEnabled && armedImageKey === key ? "ring-2 ring-[#5E6F82] shadow-lg" : "",
                                  ].join(" ")}
                                  onClick={() => openPreview(key)}
                                  onMouseEnter={() => armExtractPreview(key)}
                                  onPointerDown={(e) => {
                                    startArmHold(key);
                                    beginStep3TilePointerDrag(e, key, img.url);
                                  }}
                                  onMouseUp={cancelArmHold}
                                  onMouseLeave={() => {
                                    cancelArmHold();
                                    clearExtractPreview();
                                  }}
                                  data-step3-thumb-slot="1"
                                  data-group-key={g.key}
                                  data-thumb-key={key}
                                >
                                  <button
                                    type="button"
                                    aria-label="选择图片"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSelected(key);
                                    }}
                                    className={[
                                      "absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border backdrop-blur",
                                      selectedImageKeys.includes(key)
                                        ? "border-amber-300 bg-amber-50"
                                        : "border-gray-300 bg-white/90",
                                    ].join(" ")}
                                  >
                                    {selectedImageKeys.includes(key) ? (
                                      <span className="text-[9px] font-bold text-amber-800">✓</span>
                                    ) : null}
                                  </button>
                                  <div className="aspect-[4/3] overflow-hidden rounded-xl bg-[#EEF2F5]">
                                    <img
                                      src={thumbUrlByKey[key] || img.url}
                                      alt={galleryTypeLabel(img.type)}
                                      className="h-full w-full object-cover"
                                      draggable={false}
                                      loading="lazy"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="relative h-full min-h-[88px]">
                            <div className="relative h-full min-h-[88px]">
                              {rightColThumbs.map((img, idx) => {
                                const key = getImageInstanceKey(img);
                                const isHovered = hoveredStackCardKey === key;
                                const isExtracted = extractedStackCardKey === key;
                                const hoveredIdx = hoveredStackCardKey
                                  ? rightColThumbs.findIndex((x) => getImageInstanceKey(x) === hoveredStackCardKey)
                                  : -1;
                                const distance = hoveredIdx >= 0 ? Math.abs(idx - hoveredIdx) : 99;
                                const neighborScale =
                                  distance === 0 ? 1.11 : distance === 1 ? 1.06 : distance === 2 ? 1.03 : 1;
                                const baseScale = isExtracted ? 1.14 : neighborScale;
                                const z = isExtracted ? 90 : isHovered ? 80 : idx + 1;
                                const liftY = (isHovered ? -16 : 0) + (isExtracted ? -22 : 0);
                                const top =
                                  rightColThumbs.length <= 1
                                    ? "0px"
                                    : `calc((100% - 69px) * ${idx} / ${rightColThumbs.length - 1})`;
                                return (
                                  <div
                                    key={key}
                                    className={[
                                      "absolute left-1 w-[92px] cursor-pointer rounded-xl border border-[rgba(94,111,130,0.16)] bg-white/95 shadow-sm",
                                      "transition-all duration-200 ease-out",
                                      isHovered || isExtracted || distance <= 2
                                        ? "shadow-lg ring-1 ring-[#5E6F82]/25"
                                        : "",
                                      step3LayoutDragEnabled && armedImageKey === key ? "ring-2 ring-[#5E6F82] shadow-lg" : "",
                                    ].join(" ")}
                                    style={{
                                      top,
                                      transform: `translateY(${liftY}px) scale(${baseScale})`,
                                      zIndex: z,
                                    }}
                                    onMouseEnter={() => armExtractPreview(key)}
                                    onPointerDown={(e) => {
                                      startArmHold(key);
                                      beginStep3TilePointerDrag(e, key, img.url);
                                    }}
                                    onMouseUp={cancelArmHold}
                                    onClick={() => openPreview(key)}
                                    data-step3-thumb-slot="1"
                                    data-group-key={g.key}
                                    data-thumb-key={key}
                                  >
                                    <button
                                      type="button"
                                      aria-label="选择图片"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelected(key);
                                      }}
                                      className={[
                                        "absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border backdrop-blur",
                                        selectedImageKeys.includes(key)
                                          ? "border-amber-300 bg-amber-50"
                                          : "border-gray-300 bg-white/90",
                                      ].join(" ")}
                                    >
                                      {selectedImageKeys.includes(key) ? (
                                        <span className="text-[9px] font-bold text-amber-800">✓</span>
                                      ) : null}
                                    </button>
                                    <div className="aspect-[4/3] overflow-hidden rounded-xl bg-[#EEF2F5]">
                                      <img
                                        src={thumbUrlByKey[key] || img.url}
                                        alt={galleryTypeLabel(img.type)}
                                        className="h-full w-full object-cover"
                                        draggable={false}
                                        loading="lazy"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )
                      ) : null}
                    </div>
                  </div>
                  {step3LayoutDragEnabled && g.movedIn.length > 0 ? (
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setMovedImageTargetGroupByKey((prev) => {
                            const next = { ...prev };
                            for (const img of g.movedIn) delete next[getImageInstanceKey(img)];
                            return next;
                          });
                        }}
                        className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                      >
                        撤销本组移动
                      </button>
                    </div>
                  ) : null}
                </div>
                </WindowedMount>
              );
            })}
          </div>
          {step3LayoutDragEnabled && draggingImageKey ? (
            <div
              className={[
                "pointer-events-none sticky bottom-3 z-20 mt-2 flex",
                externalDropSide === "left" ? "justify-start" : "justify-end",
              ].join(" ")}
            >
              <div
                data-step3-extract-rail="1"
                className="pointer-events-auto w-full max-w-md rounded-full border-2 border-dashed border-[#5E6F82]/45 bg-white/92 px-5 py-3 text-center text-sm font-semibold text-[#4A5563] shadow-lg backdrop-blur"
              >
                {externalDropSide === "left"
                  ? "拖到左吸附条：抽出并在来源组上方新建一组"
                  : "拖到右吸附条：抽出并在来源组下方新建一组"}
              </div>
            </div>
          ) : null}

        </>
      ) : (
        <div className="rounded-xl border border-dashed border-[rgba(94,111,130,0.22)] bg-[color-mix(in_srgb,var(--create-surface-paper)_70%,var(--create-surface-tray))] p-6 text-sm text-gray-600">
          {viewMode === "history" ? (
            historyTotals.total === 0 ? (
              <>暂无 Step3 历史记录（请先在 Step 2 选择视角并点击「生成展示图组合」）。</>
            ) : (
              <>
                有历史记录（共 {historyTotals.total} 张展示图）。
              </>
            )
          ) : viewMode === "favorites" ? (
            <>暂无收藏展示图。可在历史记录中点击右下角星标收藏。</>
          ) : (
            <>请先在 Step 2 选择主视图；再在 Step 2 选择要生成的视角，并点击「生成展示图组合」后，结果才会出现在这里。</>
          )}
        </div>
      )}
      </div>
      {showPromptModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4"
          onClick={() => setShowPromptModal(false)}
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
        renderActions={({ item }) => {
          const currentKey = (item as { instanceKey?: string }).instanceKey;
          const current = currentKey ? imageByKey[currentKey] : null;
          if (!current) return null;
          return (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-gray-700">{galleryTypeLabel(current.type)}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleSelected(getImageInstanceKey(current))}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold"
                >
                  {selectedImageKeys.includes(getImageInstanceKey(current)) ? "取消选中" : "选中"}
                </button>
                {current.debugPromptZh ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPromptModalText(current.debugPromptZh ?? "");
                      setShowPromptModal(true);
                    }}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold"
                  >
                    查看提示词
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await downloadImage(current.url, `${current.type}_${current.id}.${getDataUrlExt(current.url)}`);
                    } catch {
                      emitToast({ message: "下载失败：图片地址不可访问或跨域受限。", type: "error" });
                    }
                  }}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold"
                >
                  下载
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyDataUrlImageToClipboard(current.url);
                    if (ok) emitToast({ message: "已复制图片到剪贴板", type: "success" });
                    else emitToast({ message: "复制失败，请重试", type: "error" });
                  }}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold"
                >
                  复制
                </button>
                {viewMode !== "current" ? (
                  <button
                    type="button"
                    onClick={() =>
                      toggleGalleryHistoryFavoriteBySelector({
                        id: current.id,
                        setId: current.setId,
                        sourceMainImageId: current.sourceMainImageId,
                        type: current.type,
                        createdAt: current.createdAt,
                      })
                    }
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold"
                  >
                    {current.isFavorite ? "取消收藏" : "收藏"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={status.step3Generating || refreshingId === current.id}
                  onClick={async () => {
                    setViewMode("current");
                    setRefreshingId(current.id);
                    try {
                      await regenerateGalleryImage(current.id);
                    } finally {
                      setRefreshingId(null);
                    }
                  }}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  重试
                </button>
                {viewMode !== "current" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (current.isFavorite) {
                        emitToast({
                          message: "该图片已收藏，请先取消收藏再删除。",
                          type: "info",
                          durationMs: 1800,
                        });
                        return;
                      }
                      setConfirmDelete({ keys: [getImageInstanceKey(current)], scope: "selection" });
                    }}
                    className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    删除
                  </button>
                ) : null}
              </div>
            </div>
          );
        }}
        onClose={() => {
          setPreviewItems([]);
          setPreviewIndex(0);
        }}
      />

      {confirmDelete ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmDelete(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-gray-900">
              {confirmDelete.scope === "group" ? "确认删除整组展示图？" : "确认删除 Step3 历史图片"}
            </div>
            <p className="mt-2 text-sm text-gray-700">
              {confirmDelete.scope === "group"
                ? `将删除本组全部展示图（左侧主图与右侧全部视角，共 ${confirmDelete.keys.length} 张）。已收藏（★）的图片会自动保留。确认继续吗？`
                : `将删除选中的 ${confirmDelete.keys.length} 张历史图片。已收藏（★）的图片会自动保留。确认继续吗？`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <BrandButton
                type="button"
                variant="outline"
                shape="full"
                onClick={() => setConfirmDelete(null)}
                className="h-[34px] px-4 text-sm"
              >
                取消
              </BrandButton>
              <BrandButton
                type="button"
                variant="danger"
                shape="full"
                onClick={async () => {
                  const keys = confirmDelete.keys;
                  const selectors = keys
                    .map((k) => imageByKey[k])
                    .filter((x): x is (typeof displayImages)[number] => !!x)
                    .map((x) => ({
                      id: x.id,
                      setId: x.setId,
                      sourceMainImageId: x.sourceMainImageId,
                      type: x.type,
                      createdAt: x.createdAt,
                    }));
                  if (selectors.length) {
                    const ok = await deleteGalleryHistoryImagesBySelectors(selectors);
                    if (ok) setSelectedImageKeys([]);
                  } else {
                    setSelectedImageKeys([]);
                  }
                  setConfirmDelete(null);
                }}
                className="h-[34px] px-4 text-sm transition-all hover:brightness-110 hover:shadow-[0_6px_16px_rgba(220,38,38,0.25)] focus-visible:ring-2 focus-visible:ring-red-300"
              >
                确认删除
              </BrandButton>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        @keyframes stackPop {
          0% {
            transform: translateY(0) scale(0.96);
          }
          60% {
            transform: translateY(-2px) scale(1.03);
          }
          100% {
            transform: translateY(0) scale(1);
          }
        }
      `}</style>

    </div>
  );
}
