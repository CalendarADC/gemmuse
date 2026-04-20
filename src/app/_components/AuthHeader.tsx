"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useJewelryGeneratorStore } from "@/store/jewelryGeneratorStore";

export default function AuthHeader({
  email,
  role,
}: {
  email: string;
  role: "ADMIN" | "USER";
}) {
  const prepareForSignOut = useJewelryGeneratorStore((s) => s.prepareForSignOut);

  const handleSignOut = async () => {
    prepareForSignOut();
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <header className="w-full border-b border-zinc-200 bg-white/90 px-4 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <p className="text-sm text-zinc-700">
          当前用户：<span className="font-medium">{email}</span>（{role}）
        </p>
        <div className="flex items-center gap-3 text-sm">
          {role === "ADMIN" ? (
            <Link href="/admin/users" className="text-zinc-700 underline">
              用户后台
            </Link>
          ) : null}
          <button
            onClick={() => {
              void handleSignOut();
            }}
            className="rounded bg-zinc-900 px-3 py-1 text-white"
          >
            退出登录
          </button>
        </div>
      </div>
    </header>
  );
}
