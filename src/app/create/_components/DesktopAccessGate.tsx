"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TOKEN_KEY = "desktop_access_token";

type GateState =
  | { phase: "checking"; message: string }
  | { phase: "authorized" }
  | { phase: "blocked"; message: string };

function shouldAttachDesktopHeaders(url: URL): boolean {
  const p = url.pathname;
  return (
    p.startsWith("/api/generate-main") ||
    p.startsWith("/api/enhance") ||
    p.startsWith("/api/generate-copy") ||
    p.startsWith("/api/desktop/heartbeat")
  );
}

export default function DesktopAccessGate() {
  const [state, setState] = useState<GateState>({ phase: "checking", message: "正在校验桌面授权..." });
  const tokenRef = useRef<string>("");
  const deviceIdRef = useRef<string>("");
  const deviceNameRef = useRef<string>("");
  const patchedRef = useRef(false);

  const patchFetchWithDesktopHeaders = useCallback(() => {
    if (patchedRef.current) return;
    const original = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(requestUrl, window.location.origin);
      if (!tokenRef.current || !shouldAttachDesktopHeaders(url)) {
        return original(input, init);
      }
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      headers.set("x-desktop-client", "electron");
      headers.set("x-desktop-device-id", deviceIdRef.current);
      headers.set("x-desktop-access-token", tokenRef.current);
      return original(input, { ...init, headers });
    }) as typeof window.fetch;
    patchedRef.current = true;
  }, []);

  const activate = useCallback(async () => {
    if (!window.desktopBridge?.isDesktop) {
      setState({ phase: "blocked", message: "该账号仅支持桌面客户端使用。请安装并打开 GemMuse Desktop。" });
      return false;
    }
    const info = window.desktopBridge.getDeviceInfo();
    deviceIdRef.current = info.deviceId;
    deviceNameRef.current = info.deviceName;

    setState({ phase: "checking", message: "正在激活设备..." });
    const res = await fetch("/api/desktop/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: "electron",
        deviceId: info.deviceId,
        deviceName: info.deviceName,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; accessToken?: string };
    if (!res.ok || !data.accessToken) {
      setState({ phase: "blocked", message: data.message || `设备激活失败（HTTP ${res.status}）` });
      return false;
    }
    tokenRef.current = data.accessToken;
    localStorage.setItem(TOKEN_KEY, data.accessToken);
    patchFetchWithDesktopHeaders();
    setState({ phase: "authorized" });
    return true;
  }, [patchFetchWithDesktopHeaders]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!window.desktopBridge?.isDesktop) {
        setState({ phase: "blocked", message: "该账号仅支持桌面客户端使用。请安装并打开 GemMuse Desktop。" });
        return;
      }
      const info = window.desktopBridge.getDeviceInfo();
      deviceIdRef.current = info.deviceId;
      deviceNameRef.current = info.deviceName;
      const cached = localStorage.getItem(TOKEN_KEY)?.trim() ?? "";
      if (cached) {
        tokenRef.current = cached;
        patchFetchWithDesktopHeaders();
        const hb = await fetch("/api/desktop/heartbeat", {
          method: "POST",
          headers: {
            "x-desktop-client": "electron",
            "x-desktop-device-id": info.deviceId,
            "x-desktop-access-token": cached,
          },
        });
        if (hb.ok) {
          if (alive) setState({ phase: "authorized" });
          return;
        }
      }
      await activate();
    };
    void run();
    return () => {
      alive = false;
    };
  }, [activate, patchFetchWithDesktopHeaders]);

  useEffect(() => {
    if (state.phase !== "authorized") return;
    const timer = window.setInterval(async () => {
      if (!tokenRef.current) return;
      const res = await fetch("/api/desktop/heartbeat", {
        method: "POST",
        headers: {
          "x-desktop-client": "electron",
          "x-desktop-device-id": deviceIdRef.current,
          "x-desktop-access-token": tokenRef.current,
        },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        tokenRef.current = "";
        localStorage.removeItem(TOKEN_KEY);
        setState({ phase: "blocked", message: data.message || "桌面授权心跳失败，请重新激活设备。" });
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [state.phase]);

  if (state.phase === "authorized") return null;

  return (
    <div className="relative z-20 mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      <p>{state.message}</p>
      {state.phase === "blocked" ? (
        <button
          type="button"
          onClick={() => void activate()}
          className="mt-3 rounded bg-rose-600 px-3 py-1.5 text-white"
        >
          重试激活
        </button>
      ) : null}
    </div>
  );
}
