"use client";

import { useEffect, useRef, useState } from "react";
import { onToast, type AppToastPayload } from "@/lib/ui/toast";

export default function AppToastHost() {
  const [toast, setToast] = useState<AppToastPayload | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return onToast((payload) => {
      setToast(payload);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(
        () => setToast(null),
        Math.max(900, payload.durationMs ?? 1400)
      );
    });
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!toast) return null;
  const type = toast.type ?? "success";
  const cls =
    type === "error"
      ? "bg-red-600/95 text-white"
      : type === "info"
        ? "bg-gray-900/85 text-white"
        : "bg-green-600/95 text-white";

  return (
    <div className={`fixed bottom-5 right-5 z-[120] rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${cls}`}>
      {toast.message}
    </div>
  );
}

