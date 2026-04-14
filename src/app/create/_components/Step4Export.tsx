"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useJewelryGeneratorStore } from "@/store/jewelryGeneratorStore";
import CircularSparkleGenerateButton from "./CircularSparkleGenerateButton";
import { emitToast } from "@/lib/ui/toast";
import { CREATE_STEP_PAPER } from "./createStepShell";
// Step4 现在只保留文案区；图片预览/下载移动到 Step3

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

function downloadDataUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function getDataUrlExt(url: string): string {
  // url: data:image/png;base64,....
  if (url.startsWith("data:image/svg+xml")) return "svg";
  if (url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg")) return "jpg";
  if (url.startsWith("data:image/webp")) return "webp";
  return "png";
}

export default function Step4Export() {
  const {
    galleryImages,
    selectedMainImageId,
    selectedMainImageUrl,
    copywriting,
    lastTextModelUsed,
    lastImageCountPassed,
    generateCopywriting,
    status,
    error,
  } = useJewelryGeneratorStore();

  const step4StartedAt = status.step4GenerationStartedAt;
  const [step4TimerTick, setStep4TimerTick] = useState(0);

  const tagsAsEtsy = useMemo(() => {
    // Etsy tags 可用逗号分隔/空格分隔，这里用逗号+空格更直观
    return (copywriting.tags ?? []).join(", ");
  }, [copywriting.tags]);

  const canStartCopywriting =
    !!selectedMainImageId && !!(selectedMainImageUrl || galleryImages.length);

  useEffect(() => {
    if (step4StartedAt == null) return;
    const id = window.setInterval(() => setStep4TimerTick((t) => t + 1), 200);
    return () => window.clearInterval(id);
  }, [step4StartedAt]);

  const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const displayElapsedMs =
    status.step4Generating && step4StartedAt != null
      ? Date.now() - step4StartedAt + step4TimerTick * 0
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="text-lg font-bold text-gray-900 md:text-xl">Step 4：智能文案与导出</div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <CircularSparkleGenerateButton
            canStart={canStartCopywriting}
            loading={status.step4Generating}
            onClick={() => generateCopywriting()}
            ariaLabel="生成 Etsy 文案"
            title="生成 Etsy 文案"
          />

          {status.step4Generating ? (
            <div className="text-xs font-semibold text-gray-700">
              耗时：{formatElapsed(displayElapsedMs)}
            </div>
          ) : null}

          {!status.step4Generating && lastTextModelUsed ? (
            <div className="text-xs font-semibold text-gray-700">使用模型：{lastTextModelUsed}</div>
          ) : null}

          {!status.step4Generating && typeof lastImageCountPassed === "number" ? (
            <div className="text-xs font-semibold text-gray-700">传入图片张数：{lastImageCountPassed}</div>
          ) : null}
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4">
        <section className={`${CREATE_STEP_PAPER} md:min-h-[200px]`}>
          <div className="text-sm font-semibold text-gray-900">文案区（复制即用）</div>

          <div className="mt-3 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-gray-700">Title</div>
                <button
                  type="button"
                  disabled={!copywriting.title}
                  onClick={async () => {
                    try {
                      await copyToClipboard(copywriting.title);
                      emitToast({ message: "Title 已复制", type: "success" });
                    } catch {
                      emitToast({ message: "复制失败，请重试", type: "error" });
                    }
                  }}
                  className="rounded-xl border border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] px-3 py-1 text-xs font-semibold text-[#363028] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_10%,var(--create-surface-paper))] disabled:opacity-50"
                >
                  一键复制
                </button>
              </div>
              <textarea
                value={copywriting.title}
                readOnly
                className="h-24 w-full resize-none rounded-xl border border-[rgba(94,111,130,0.16)] bg-[color-mix(in_srgb,var(--create-surface-paper)_96%,var(--create-surface-tray))] p-3 text-sm text-gray-900 outline-none"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-gray-700">Tags（13 个）</div>
                <button
                  type="button"
                  disabled={!copywriting.tags?.length}
                  onClick={async () => {
                    try {
                      await copyToClipboard(tagsAsEtsy);
                      emitToast({ message: "Tags 已复制", type: "success" });
                    } catch {
                      emitToast({ message: "复制失败，请重试", type: "error" });
                    }
                  }}
                  className="rounded-xl border border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] px-3 py-1 text-xs font-semibold text-[#363028] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_10%,var(--create-surface-paper))] disabled:opacity-50"
                >
                  一键复制
                </button>
              </div>
              <textarea
                value={tagsAsEtsy}
                readOnly
                className="h-24 w-full resize-none rounded-xl border border-[rgba(94,111,130,0.16)] bg-[color-mix(in_srgb,var(--create-surface-paper)_96%,var(--create-surface-tray))] p-3 text-sm text-gray-900 outline-none"
              />
              {copywriting.tags?.length ? (
                <div className="text-[11px] text-gray-500">
                  当前标签数量：{copywriting.tags.length}（Etsy 期望 13 个，可后续再做严格校验）
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-gray-700">Description</div>
                <button
                  type="button"
                  disabled={!copywriting.description}
                  onClick={async () => {
                    try {
                      await copyToClipboard(copywriting.description);
                      emitToast({ message: "Description 已复制", type: "success" });
                    } catch {
                      emitToast({ message: "复制失败，请重试", type: "error" });
                    }
                  }}
                  className="rounded-xl border border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] px-3 py-1 text-xs font-semibold text-[#363028] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_10%,var(--create-surface-paper))] disabled:opacity-50"
                >
                  一键复制
                </button>
              </div>
              <textarea
                value={copywriting.description}
                readOnly
                className="h-56 w-full resize-none rounded-xl border border-[rgba(94,111,130,0.16)] bg-[color-mix(in_srgb,var(--create-surface-paper)_96%,var(--create-surface-tray))] p-3 text-sm text-gray-900 outline-none"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

