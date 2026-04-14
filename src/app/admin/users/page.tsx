import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";

import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ResetPasswordForm from "./ResetPasswordForm";

async function updateUser(formData: FormData) {
  "use server";
  await requireAdminUser();

  const userId = String(formData.get("userId") || "");
  const action = String(formData.get("action") || "");

  if (!userId) return;

  if (action === "approve") {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    });
  } else if (action === "reject") {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "REJECTED" },
    });
  } else if (action === "disable") {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "DISABLED" },
    });
  } else if (action === "enable") {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    });
  } else if (action === "promote") {
    await prisma.user.update({
      where: { id: userId },
      data: { role: "ADMIN" },
    });
  } else if (action === "demote") {
    await prisma.user.update({
      where: { id: userId },
      data: { role: "USER" },
    });
  } else if (action === "reset_password_12345678") {
    const passwordHash = await hash("12345678", 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  revalidatePath("/admin/users");
}

export default async function AdminUsersPage() {
  const me = await requireAdminUser();
  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return (
    <main className="p-6 md:p-10">
      <h1 className="text-2xl font-semibold">用户管理后台</h1>
      <p className="mt-2 text-sm text-zinc-600">
        当前管理员：{me.email}。可审核新注册账号、启用/禁用用户及调整管理员权限。
      </p>
      <p className="mt-1 text-xs text-amber-700">
        支持一键重置用户密码为 12345678（用户登录后建议尽快修改）。
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="px-4 py-3 text-left">姓名</th>
              <th className="px-4 py-3 text-left">邮箱</th>
              <th className="px-4 py-3 text-left">角色</th>
              <th className="px-4 py-3 text-left">状态</th>
              <th className="px-4 py-3 text-left">注册时间</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-zinc-100">
                <td className="px-4 py-3">{u.name || "-"}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{u.role}</td>
                <td className="px-4 py-3">{u.status}</td>
                <td className="px-4 py-3">{u.createdAt.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {u.status === "PENDING" ? (
                      <>
                        <form action={updateUser}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="action" value="approve" />
                          <button className="rounded bg-emerald-600 px-2 py-1 text-white">
                            通过
                          </button>
                        </form>
                        <form action={updateUser}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="action" value="reject" />
                          <button className="rounded bg-rose-600 px-2 py-1 text-white">拒绝</button>
                        </form>
                      </>
                    ) : null}

                    {u.status === "ACTIVE" ? (
                      <form action={updateUser}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="action" value="disable" />
                        <button className="rounded bg-amber-600 px-2 py-1 text-white">禁用</button>
                      </form>
                    ) : null}

                    {(u.status === "DISABLED" || u.status === "REJECTED") && (
                      <form action={updateUser}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="action" value="enable" />
                        <button className="rounded bg-sky-700 px-2 py-1 text-white">启用</button>
                      </form>
                    )}

                    {u.role === "USER" ? (
                      <form action={updateUser}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="action" value="promote" />
                        <button className="rounded bg-zinc-700 px-2 py-1 text-white">
                          设为管理员
                        </button>
                      </form>
                    ) : (
                      me.id !== u.id && (
                        <form action={updateUser}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="action" value="demote" />
                          <button className="rounded bg-zinc-500 px-2 py-1 text-white">
                            取消管理员
                          </button>
                        </form>
                      )
                    )}

                    <ResetPasswordForm userId={u.id} email={u.email} action={updateUser} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
