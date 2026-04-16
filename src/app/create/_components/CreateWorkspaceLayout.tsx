"use client";

import type { ReactNode } from "react";
import DragScrollAssist from "./DragScrollAssist";
import AppToastHost from "./AppToastHost";
import TaskSidebar from "./TaskSidebar";
import CreateStepNav from "./CreateStepNav";
export default function CreateWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <main className="create-workspace-chrome flex min-h-screen flex-col lg:flex-row">
      <div className="order-2 flex min-h-0 w-full shrink-0 flex-col lg:order-1 lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:min-w-0">
        <TaskSidebar />
      </div>

      <div className="relative order-1 flex min-h-screen min-w-0 flex-1 flex-col lg:order-2">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(165deg, var(--create-surface-canvas) 0%, color-mix(in srgb, var(--create-surface-tray) 20%, var(--create-surface-canvas)) 100%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.055] mix-blend-soft-light"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.62'/%3E%3C/svg%3E\")",
            backgroundSize: "220px 220px",
            backgroundRepeat: "repeat",
          }}
        />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <header className="flex min-h-[var(--create-chrome-header-height)] shrink-0 items-center justify-end bg-[color-mix(in_srgb,var(--create-surface-canvas)_82%,transparent)] px-4 py-4 backdrop-blur-[2px] sm:px-6">
            <CreateStepNav />
          </header>

          <div className="relative mx-auto min-h-0 w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
            <DragScrollAssist />
            <AppToastHost />
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
