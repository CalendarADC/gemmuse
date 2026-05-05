"use client";

import Image from "next/image";

export type CircularSparkleGenerateButtonProps = {
  /** Prerequisites met (excluding loading); amber ring shows when true or while loading */
  canStart: boolean;
  loading: boolean;
  /** 例如 Step1 AI 扩写进行中：禁用并灰显，避免与扩写并发 */
  lockout?: boolean;
  onClick: () => void | Promise<void | boolean>;
  ariaLabel: string;
  title?: string;
};

/**
 * Step1-style circular sparkle generate control (shared by Step 2–4).
 */
export default function CircularSparkleGenerateButton({
  canStart,
  loading,
  lockout = false,
  onClick,
  ariaLabel,
  title,
}: CircularSparkleGenerateButtonProps) {
  const showAmberChrome = (canStart && !lockout) || loading;
  const disabled = !canStart || loading || lockout;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onClick()}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-sm transition ${
        showAmberChrome
          ? `border-amber-300 bg-amber-50 text-amber-800 ${canStart && !loading && !lockout ? "hover:bg-amber-100" : ""}`
          : "cursor-not-allowed border-gray-200 bg-[var(--create-surface-paper)] text-gray-400 opacity-60"
      } ${loading ? "animate-pulse" : ""}`}
      aria-label={loading ? "生成中" : lockout ? "暂不可用" : ariaLabel}
      title={loading ? "生成中…" : lockout ? "AI 扩写进行中…" : title ?? ariaLabel}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
      ) : (
        <Image
          src="/icons/step1-sparkles.png"
          alt=""
          width={18}
          height={18}
          className="object-contain"
          aria-hidden
        />
      )}
    </button>
  );
}
