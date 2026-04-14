import Link from "next/link";

export default function PendingPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-100 p-6">
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow">
        <h1 className="text-2xl font-semibold text-zinc-900">账号审核中</h1>
        <p className="mt-3 text-zinc-600">
          你的注册申请已提交，管理员审核通过后即可登录并使用内部平台。
        </p>
        <div className="mt-6">
          <Link href="/login" className="rounded-lg bg-zinc-900 px-4 py-2 text-white inline-block">
            返回登录页
          </Link>
        </div>
      </div>
    </main>
  );
}
