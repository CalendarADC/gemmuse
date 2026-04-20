"use client";

export default function CreateRouteLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--create-surface-canvas)]">
      <div className="rounded-xl border border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] px-4 py-3 text-sm text-[#4f4740] shadow-sm">
        页面加载中，请稍候…
      </div>
    </main>
  );
}
