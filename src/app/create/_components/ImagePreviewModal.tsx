"use client";

import React, { useEffect } from "react";

type PreviewItem = { url: string; alt?: string };

function ArrowIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {dir === "left" ? (
        <path
          d="M15 18L9 12L15 6"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M9 18L15 12L9 6"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export default function ImagePreviewModal(props: {
  open: boolean;
  onClose: () => void;
  // Navigation mode (recommended)
  items?: PreviewItem[];
  index?: number;
  onIndexChange?: (nextIndex: number) => void;
  renderActions?: (ctx: { item: PreviewItem; index: number; total: number }) => React.ReactNode;
  // Back-compat: single-image mode
  url?: string;
  alt?: string;
}) {
  const { open, onClose } = props;
  const items: PreviewItem[] =
    props.items && props.items.length
      ? props.items
      : props.url
        ? [{ url: props.url, alt: props.alt }]
        : [];

  const len = items.length;
  const safeIndex =
    typeof props.index === "number" ? Math.max(0, Math.min(props.index, len - 1)) : 0;

  const current = items[safeIndex];

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !current) return null;

  const canNav = typeof props.onIndexChange === "function" && len > 1;

  const goPrev = () => {
    if (!canNav) return;
    const prev = safeIndex - 1 < 0 ? len - 1 : safeIndex - 1;
    props.onIndexChange?.(prev);
  };

  const goNext = () => {
    if (!canNav) return;
    const next = (safeIndex + 1) % len;
    props.onIndexChange?.(next);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        // 点击遮罩关闭；点击图片内容不关闭
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-4xl">
        <div className="mt-6 flex items-center justify-center rounded-2xl bg-white p-2">
          {canNav ? (
            <>
              <button
                type="button"
                aria-label="上一张"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur hover:bg-black/60 disabled:opacity-50"
              >
                <ArrowIcon dir="left" />
              </button>
              <button
                type="button"
                aria-label="下一张"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur hover:bg-black/60 disabled:opacity-50"
              >
                <ArrowIcon dir="right" />
              </button>
            </>
          ) : null}
          <img
            src={current.url}
            alt={current.alt || "preview"}
            className="max-h-[80vh] max-w-[90vw] rounded-xl object-contain"
            onClick={() => onClose()}
          />
        </div>
        {props.renderActions ? (
          <div className="mt-3 rounded-xl bg-white/95 p-2 shadow">
            {props.renderActions({ item: current, index: safeIndex, total: len })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
