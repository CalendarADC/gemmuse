"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function mapLoginError(raw: string | null): string {
  if (!raw) return "登录失败，请检查邮箱和密码。";
  if (raw.includes("PENDING_APPROVAL")) return "账号待管理员审核，请稍后再试。";
  if (raw.includes("ACCOUNT_DISABLED")) return "账号已被禁用，请联系管理员。";
  if (raw.includes("ACCOUNT_REJECTED")) return "账号申请未通过，请联系管理员。";
  return "登录失败，请检查邮箱和密码。";
}

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextUrl = useMemo(() => {
    const nxt = params.get("next");
    return nxt && nxt.startsWith("/") ? nxt : "/create/design";
  }, [params]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: nextUrl,
    });

    setLoading(false);
    if (result?.ok && result.url) {
      router.push(result.url);
      router.refresh();
      return;
    }
    setError(mapLoginError(result?.error ?? null));
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold text-zinc-900">内部平台登录</h1>
        <p className="mt-2 text-sm text-zinc-500">仅审核通过的内部账号可访问。</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700">邮箱</span>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700">密码</span>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
        <p className="mt-4 text-sm text-zinc-600">
          还没有账号？{" "}
          <Link href="/register" className="text-zinc-900 underline">
            提交注册申请
          </Link>
        </p>
      </div>
    </main>
  );
}
