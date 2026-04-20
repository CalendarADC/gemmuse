/**
 * 运行时合并 DATABASE_URL 查询参数（不修改 .env 文件）。
 * 常见托管方（Neon / Supabase pooler 等）建议在 URL 上设置 connection_limit、connect_timeout、pool_timeout。
 *
 * 可选环境变量（仅在 URL 未显式包含该参数时追加）：
 * - DATABASE_POOL_MAX → connection_limit
 * - DATABASE_CONNECT_TIMEOUT_SEC → connect_timeout（秒）
 * - DATABASE_POOL_TIMEOUT_SEC → pool_timeout（秒）
 */
export function buildRuntimeDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw?.trim()) {
    throw new Error("DATABASE_URL is not set");
  }
  try {
    const u = new URL(raw);
    const max = process.env.DATABASE_POOL_MAX?.trim();
    if (max && !u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", max);
    }
    const connectSec = process.env.DATABASE_CONNECT_TIMEOUT_SEC?.trim();
    if (connectSec && !u.searchParams.has("connect_timeout")) {
      u.searchParams.set("connect_timeout", connectSec);
    }
    const poolSec = process.env.DATABASE_POOL_TIMEOUT_SEC?.trim();
    if (poolSec && !u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", poolSec);
    }
    return u.toString();
  } catch {
    return raw;
  }
}
