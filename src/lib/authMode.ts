/** 与 desktopLocalMode 中 env 解析一致 */
function envEnabled(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "on";
}

/**
 * 密钥模式（默认开启）：用户仅需填写 LaoZhang API Key，无需注册/登录/审核。
 * 设为 `0` 可恢复旧版账号 + 会话鉴权（需自行配置 NEXTAUTH 与数据库）。
 */
export function isKeyOnlyAuthEnabled(): boolean {
  const raw =
    process.env.GEMMUSE_KEY_ONLY_AUTH?.trim() ||
    process.env.NEXT_PUBLIC_GEMMUSE_KEY_ONLY_AUTH?.trim() ||
    "1";
  return envEnabled(raw);
}
