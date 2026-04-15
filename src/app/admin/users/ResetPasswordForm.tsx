"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function ResetPasswordForm({
  userId,
  email,
  action,
}: {
  userId: string;
  email: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const formId = `admin-reset-pw-${userId}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <form id={formId} action={action} className="inline">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="action" value="reset_password_12345678" />
        <button
          type="button"
          className="rounded bg-indigo-700 px-2 py-1 text-white hover:bg-indigo-800"
          onClick={() => setOpen(true)}
        >
          重置密码12345678
        </button>
      </form>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4"
              onClick={() => setOpen(false)}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) e.preventDefault();
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-reset-pw-title"
            >
              <div
                className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <div id="admin-reset-pw-title" className="text-sm font-semibold text-zinc-900">
                  确认重置密码
                </div>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  确定将用户「<span className="font-medium text-zinc-800">{email}</span>
                  」的密码重置为 <span className="font-mono text-zinc-800">12345678</span>
                  ？请确保对方知悉，并建议其登录后尽快修改密码。
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
                    onClick={() => setOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    form={formId}
                    className="rounded-md bg-indigo-700 px-4 py-2 text-sm text-white hover:bg-indigo-800"
                    onClick={() => setOpen(false)}
                  >
                    确认重置
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
