"use client";

export type AppToastType = "success" | "error" | "info";

export type AppToastPayload = {
  message: string;
  type?: AppToastType;
  durationMs?: number;
};

const APP_TOAST_EVENT = "app-toast";

export function emitToast(payload: AppToastPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AppToastPayload>(APP_TOAST_EVENT, { detail: payload }));
}

export function onToast(handler: (payload: AppToastPayload) => void) {
  if (typeof window === "undefined") return () => undefined;
  const listener = (e: Event) => {
    const ce = e as CustomEvent<AppToastPayload>;
    if (!ce.detail?.message) return;
    handler(ce.detail);
  };
  window.addEventListener(APP_TOAST_EVENT, listener as EventListener);
  return () => window.removeEventListener(APP_TOAST_EVENT, listener as EventListener);
}

