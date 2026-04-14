"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const STEPS = [
  { href: "/create/design", label: "构思", segment: "design" },
  { href: "/create/image", label: "视觉", segment: "image" },
  { href: "/create/gallery", label: "图集", segment: "gallery" },
  { href: "/create/details", label: "细部", segment: "details" },
] as const;

export default function CreateStepNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  // 进入创作区后后台预取各步路由，减少首次点击时长时间停在 “Compiling…”
  useEffect(() => {
    STEPS.forEach(({ href }) => {
      router.prefetch(href);
    });
  }, [router]);

  return (
    <nav
      aria-label="创作步骤"
      className="inline-flex shrink-0 rounded-full border border-[rgba(94,111,130,0.18)] bg-[color-mix(in_srgb,var(--create-surface-tray)_42%,var(--create-surface-canvas))] p-1 shadow-sm backdrop-blur-sm"
    >
      {STEPS.map(({ href, label, segment }) => {
        const active =
          pathname === href || pathname.endsWith(`/${segment}`);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-full px-3.5 py-2 text-sm font-semibold transition sm:px-4 ${
              active
                ? "bg-[var(--create-surface-paper)] text-[#2c2824] shadow-sm ring-1 ring-[rgba(94,111,130,0.12)]"
                : "text-[#5c534c] hover:bg-[color-mix(in_srgb,var(--create-surface-paper)_55%,transparent)] hover:text-[#2c2824]"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
