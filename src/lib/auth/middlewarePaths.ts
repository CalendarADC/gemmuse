const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/pending"]);

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname.startsWith("/api/register")) return true;
  return false;
}

/** 与 `requireApiActiveUser` 保护的生成类接口对齐：未登录访问这些路径会重定向到登录页。 */
export function isProtectedPath(pathname: string): boolean {
  if (pathname.startsWith("/create")) return true;
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/api/generate-main")) return true;
  if (pathname.startsWith("/api/enhance")) return true;
  if (pathname.startsWith("/api/generate-copy")) return true;
  if (pathname.startsWith("/api/step1-expand")) return true;
  if (pathname.startsWith("/api/tasks")) return true;
  return false;
}
