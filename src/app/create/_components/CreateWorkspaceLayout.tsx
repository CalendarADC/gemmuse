"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import DragScrollAssist from "./DragScrollAssist";
import AppToastHost from "./AppToastHost";
import TaskSidebar from "./TaskSidebar";
import CreateStepNav from "./CreateStepNav";
import ApiKeyPillButton from "./ApiKeyPillButton";
import DesktopRuntimeBanner from "./DesktopRuntimeBanner";
import { useJewelryGeneratorStore } from "@/store/jewelryGeneratorStore";

export default function CreateWorkspaceLayout({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const initializeUserScope = useJewelryGeneratorStore((s) => s.initializeUserScope);
  const pathname = usePathname() ?? "";
  const showApiPill = pathname === "/create/design" || pathname.endsWith("/design");

  useEffect(() => {
    void initializeUserScope(userId);
  }, [initializeUserScope, userId]);

  return (
    <main className="create-workspace-chrome flex min-h-screen flex-col lg:flex-row">
      {/* 侧栏必须在主内容之上参与命中测试，避免 z-10 主栏层在部分环境下盖住左侧按钮 */}
      {/* 勿用 lg:min-w-0：全屏/极限宽度下侧栏列可能被压成 0，点击「折叠/新建」全部失效 */}
      <div className="pointer-events-auto relative z-[25] order-2 flex min-h-0 w-full shrink-0 flex-col lg:order-1 lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:min-w-[3rem]">
        <TaskSidebar />
      </div>

      <div className="relative z-0 order-1 flex min-h-screen min-w-0 flex-1 flex-col lg:order-2">
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
          {/*
            顶栏内「密钥」下拉为 absolute 且向下溢出；主内容（如 GemMuse 标题）在 DOM 中位于 header 之后，
            若二者同层叠顺序，主内容会盖住下拉。header 必须高于下方内容区。
          */}
          <header className="relative z-[45] flex min-h-[var(--create-chrome-header-height)] shrink-0 items-center bg-[color-mix(in_srgb,var(--create-surface-canvas)_82%,transparent)] px-4 py-4 backdrop-blur-[2px] sm:px-6">
            <div className="flex w-full items-center justify-between gap-3">
              <div className="relative z-[46] min-w-[52px]">
                {showApiPill ? <ApiKeyPillButton /> : null}
              </div>
              <CreateStepNav />
            </div>
          </header>

          <div className="relative z-0 mx-auto min-h-0 w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
            <DragScrollAssist />
            <AppToastHost />
            <DesktopRuntimeBanner />
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}