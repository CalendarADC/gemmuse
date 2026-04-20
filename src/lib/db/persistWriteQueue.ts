/**
 * 热点 API 并发写库时，与 generate-main 内「串行 persist」一致，避免连接池耗尽。
 * 仅对 persistGeneratedImage 的 prisma 写入串行化（跨请求全局有序）。
 */
let mutex: Promise<unknown> = Promise.resolve();

export function runSerializedPersist<T>(fn: () => Promise<T>): Promise<T> {
  const next = mutex.then(() => fn());
  mutex = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}
