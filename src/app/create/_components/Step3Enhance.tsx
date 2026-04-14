"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useJewelryGeneratorStore } from "@/store/jewelryGeneratorStore";
import ImagePreviewModal from "./ImagePreviewModal";
import CircularSparkleGenerateButton from "./CircularSparkleGenerateButton";

export default function Step3Enhance() {
  const {
    selectedMainImageId,
    selectedMainImageIds,
    galleryImages,
    galleryHistoryImages,
    enhanceGalleryImages,
    setGallerySetAsCurrent,
    status,
    error,
  } = useJewelryGeneratorStore();

  const [onModel, setOnModel] = useState(true);
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const [rear, setRear] = useState(true);
  const [front, setFront] = useState(false);

  const [previewItems, setPreviewItems] = useState<
    Array<{ url: string; alt: string }>
  >([]);
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [showHistory, setShowHistory] = useState(false);

  const step3StartedAt = status.step3GenerationStartedAt;
  const [step3TimerTick, setStep3TimerTick] = useState(0);

  const canStartEnhance =
    selectedMainImageIds.length > 0 && (onModel || left || right || rear || front);

  useEffect(() => {
    if (step3StartedAt == null) return;
    const id = window.setInterval(() => setStep3TimerTick((t) => t + 1), 200);
    return () => window.clearInterval(id);
  }, [step3StartedAt]);

  const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const displayElapsedMs =
    status.step3Generating && step3StartedAt != null
      ? Date.now() - step3StartedAt + step3TimerTick * 0
      : 0;

  const currentSetId = galleryImages[0]?.setId ?? null;

  const displayedImages = useMemo(() => {
    if (!showHistory) return galleryImages;
    if (!selectedMainImageId) return [];
    return galleryHistoryImages.filter(
      (x) => x.sourceMainImageId === selectedMainImageId
    );
  }, [showHistory, galleryImages, selectedMainImageId, galleryHistoryImages]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof displayedImages>();
    for (const img of displayedImages) {
      const k = img.type;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(img);
    }
    return map;
  }, [displayedImages]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-sm font-semibold text-gray-800">Step 3：场景与细节增强</div>
        <div className="text-xs text-gray-500">
          先选择要生成的图类型（主模型一致，只换背景/角度）。
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={onModel}
                onChange={(e) => setOnModel(e.target.checked)}
              />
              生成佩戴图 (On-model Shot)
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={left}
                onChange={(e) => setLeft(e.target.checked)}
              />
              左侧视图
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={right}
                onChange={(e) => setRight(e.target.checked)}
              />
              右侧视图
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={rear}
                onChange={(e) => setRear(e.target.checked)}
              />
              后视图
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={front}
                onChange={(e) => setFront(e.target.checked)}
              />
              正视图
            </label>
          </div>

          <div className="flex flex-col items-end gap-2">
            <CircularSparkleGenerateButton
              canStart={canStartEnhance}
              loading={status.step3Generating}
              onClick={() => enhanceGalleryImages({ onModel, left, right, rear, front })}
              ariaLabel="生成展示图组合"
              title="生成展示图组合"
            />
            <div className="flex flex-col items-end gap-1">
              <div className="text-xs text-gray-500">
                {galleryImages.length
                  ? `已生成 ${galleryImages.length} 张展示图`
                  : "生成后会在下方显示"}
              </div>
              {status.step3Generating ? (
                <div className="text-xs font-semibold text-gray-700">
                  耗时：{formatElapsed(displayElapsedMs)}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={showHistory}
                onChange={(e) => setShowHistory(e.target.checked)}
              />
              历史记录
            </label>
            <div className="text-xs text-gray-500">
              当前：{galleryImages.length} 张；历史：{selectedMainImageId
                ? galleryHistoryImages.filter(
                    (x) => x.sourceMainImageId === selectedMainImageId
                  ).length
                : galleryHistoryImages.length} 张
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {displayedImages.length ? (
        <div className="space-y-3">
          <div className="text-sm font-semibold">生成结果预览</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {displayedImages.map((img) => (
              <div
                key={img.id}
                className="relative rounded-2xl border border-gray-200 bg-white p-2 cursor-zoom-in"
                role="button"
                tabIndex={0}
                onClick={() => {
                  const items = displayedImages.map((x) => ({
                    url: x.url,
                    alt: x.type,
                  }));
                  const idx = displayedImages.findIndex((x) => x.id === img.id);
                  setPreviewItems(items);
                  setPreviewIndex(idx >= 0 ? idx : 0);

                  // 如果在“历史记录”视图里，点任意一张历史图就切换到它所属的 set（从而 Step4 用对应集合）
                  if (showHistory && img.setId) setGallerySetAsCurrent(img.setId);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    const items = displayedImages.map((x) => ({
                      url: x.url,
                      alt: x.type,
                    }));
                    const idx = displayedImages.findIndex((x) => x.id === img.id);
                    setPreviewItems(items);
                    setPreviewIndex(idx >= 0 ? idx : 0);

                    if (showHistory && img.setId) setGallerySetAsCurrent(img.setId);
                  }
                }}
              >
                {currentSetId && img.setId === currentSetId ? (
                  <div className="absolute left-2 top-2 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-bold text-white">
                    Current
                  </div>
                ) : null}
                <div className="text-[11px] font-semibold text-gray-600 capitalize">
                  {img.type.replace("_", " ")}
                </div>
                <div className="aspect-square bg-gray-100">
                  <img
                    src={img.url}
                    alt={img.type}
                    className="h-full w-full object-cover rounded-xl"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>
          {grouped.size ? (
            <div className="text-xs text-gray-500">
              包含：{Array.from(grouped.entries())
                .map(([k, v]) => `${k}: ${v.length}`)
                .join("，")}
            </div>
          ) : null}
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
    </div>
  );
}

