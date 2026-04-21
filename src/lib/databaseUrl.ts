/**
 * 运行时合并 DATABASE_URL 查询参数（不修改 .env 文件）。
 * 常见托管方（Neon / Supabase pooler 等）建议在 URL 上设置 connection_limit、connect_timeout、pool_timeout。
 *
 * 环境变量（若设置则**覆盖** URL 中已有同名参数，便于不改 .env 长串即可调池）：
 * - DATABASE_POOL_MAX → connection_limit
 * - DATABASE_CONNECT_TIMEOUT_SEC → connect_timeout（秒）
 * - DATABASE_POOL_TIMEOUT_SEC → pool_timeout（秒）
 *
 * 开发环境：若 URL 里 connection_limit 过小（如 Neon 默认 5）且未设置 DATABASE_POOL_MAX，
 * 会自动抬高到安全下限，避免 Step1 等路由与其它请求并发时出现
 * "Timed out fetching a new connection from the connection pool"。
 */
export function buildRuntimeDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw?.trim()) {
    throw new Error("DATABASE_URL is not set");
  }
  try {
    const u = new URL(raw);
    const max = process.env.DATABASE_POOL_MAX?.trim();
    if (max) {
      u.searchParams.set("connection_limit", max);
    }
    const connectSec = process.env.DATABASE_CONNECT_TIMEOUT_SEC?.trim();
    if (connectSec) {
      u.searchParams.set("connect_timeout", connectSec);
    }
    const poolSec = process.env.DATABASE_POOL_TIMEOUT_SEC?.trim();
    if (poolSec) {
      u.searchParams.set("pool_timeout", poolSec);
    }

    if (process.env.NODE_ENV !== "production") {
      const currentLimit = parseInt(u.searchParams.get("connection_limit") || "0", 10);
      if (!max && (!Number.isFinite(currentLimit) || currentLimit < 10)) {
        u.searchParams.set("connection_limit", "12");
      }
      const currentPoolTimeout = parseInt(u.searchParams.get("pool_timeout") || "0", 10);
      if (!poolSec && (!Number.isFinite(currentPoolTimeout) || currentPoolTimeout <= 12)) {
        u.searchParams.set("pool_timeout", "30");
      }
    }

    return u.toString();
  } catch {
    return raw;
  }
}
