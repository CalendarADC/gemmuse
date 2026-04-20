"use client";

import { useEffect } from "react";

export default function CreateRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[create route error]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--create-surface-canvas)] p-4">
      <div className="w-full max-w-md rounded-2xl border border-[rgba(94,111,130,0.2)] bg-[var(--create-surface-paper)] p-5 shadow-sm">
        <h2 className="text-base font-semibold text-[#2f2923]">页面暂时不可用</h2>
        <p className="mt-2 text-sm text-[#5d544a]">
          刚刚出现了临时错误。你可以点击重试；如果还不行，刷新页面后再试一次生成。
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg border border-[rgba(94,111,130,0.22)] bg-[var(--create-surface-paper)] px-3 py-1.5 text-sm font-medium text-[#2f2923] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_12%,var(--create-surface-paper))]"
        >
          重试
        </button>
      </div>
    </main>
  );
}
