"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(fd.get("name") || "").trim(),
        email: String(fd.get("email") || "").trim(),
        password: String(fd.get("password") || ""),
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { message?: string };
    setLoading(false);

    if (!res.ok) {
      setError(body.message || "注册失败，请稍后重试。");
      return;
    }
    router.push("/pending");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold text-zinc-900">内部账号注册</h1>
        <p className="mt-2 text-sm text-zinc-500">提交后需管理员审核通过才可登录。</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700">姓名</span>
            <input
              name="name"
              type="text"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
            />
          </label>
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
            <span className="mb-1 block text-sm text-zinc-700">密码（至少 8 位）</span>
            <input
              name="password"
              type="password"
              minLength={8}
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
            {loading ? "提交中..." : "提交注册申请"}
          </button>
        </form>
        <p className="mt-4 text-sm text-zinc-600">
          已有账号？{" "}
          <Link href="/login" className="text-zinc-900 underline">
            去登录
          </Link>
        </p>
      </div>
    </main>
  );
}
