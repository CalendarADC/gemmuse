export const DESKTOP_LOCAL_MODE_HEADER = "x-gemmuse-desktop-local";
export const WEB_LOCAL_MODE_HEADER = "x-gemmuse-web-local";

function envEnabled(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "on";
}

export function isDesktopLocalClientMode(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.desktopBridge?.isDesktop) return false;
  const strict = process.env.NEXT_PUBLIC_DESKTOP_STRICT_LOCAL;
  if (strict && !envEnabled(strict)) return false;
  return true;
}

export function isWebStrictLocalClientMode(): boolean {
  if (typeof window === "undefined") return false;
  if (window.desktopBridge?.isDesktop) return false;
  // 网页端默认启用 strict-local（可通过环境变量显式关闭）。
  const strict = process.env.NEXT_PUBLIC_WEB_STRICT_LOCAL ?? "1";
  return envEnabled(strict);
}

export function isStrictLocalClientMode(): boolean {
  return isDesktopLocalClientMode() || isWebStrictLocalClientMode();
}

export function isDesktopLocalServerMode(req?: Request): boolean {
  if (envEnabled(process.env.DESKTOP_STRICT_LOCAL)) return true;
  // 网页端默认启用 strict-local（可通过环境变量显式关闭）。
  if (envEnabled(process.env.WEB_STRICT_LOCAL ?? "1")) return true;
  if (!req) return false;
  if (envEnabled(req.headers.get(WEB_LOCAL_MODE_HEADER) ?? undefined)) return true;
  if (!envEnabled(req.headers.get(DESKTOP_LOCAL_MODE_HEADER) ?? undefined)) return false;
  return true;
}

export function withDesktopLocalHeader(init?: HeadersInit): HeadersInit {
  if (!isStrictLocalClientMode()) return init ?? {};
  const h = new Headers(init ?? {});
  if (isDesktopLocalClientMode()) h.set(DESKTOP_LOCAL_MODE_HEADER, "1");
  if (isWebStrictLocalClientMode()) h.set(WEB_LOCAL_MODE_HEADER, "1");
  return h;
}

/**
 * 桌面安装包内嵌 Next：客户端会带 `x-gemmuse-desktop-local`（见 withDesktopLocalHeader）。
 * 不用 `isDesktopLocalServerMode(req)` 判断，以免受 WEB_STRICT_LOCAL 默认分支误伤。
 */
export function isDesktopBundledClientRequest(req: Request): boolean {
  if (envEnabled(process.env.DESKTOP_STRICT_LOCAL)) return true;
  return envEnabled(req.headers.get(DESKTOP_LOCAL_MODE_HEADER) ?? undefined);
}