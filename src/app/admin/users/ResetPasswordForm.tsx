"use client";

export default function ResetPasswordForm({
  userId,
  email,
  action,
}: {
  userId: string;
  email: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const ok = window.confirm(`确认将 ${email} 的密码重置为 12345678 吗？`);
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value="reset_password_12345678" />
      <button className="rounded bg-indigo-700 px-2 py-1 text-white">重置密码12345678</button>
    </form>
  );
}

