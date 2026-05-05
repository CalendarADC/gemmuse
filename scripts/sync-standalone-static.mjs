/**
 * Next standalone 文档要求把构建产物里的静态资源拷进 standalone 树，否则 `/_next/static/*` 无文件，
 * 页面 HTML 有但 CSS/JS 不加载（桌面版看起来像「纯 HTML」）。
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/output#how-it-works
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const src = join(root, ".next", "static");
const dest = join(root, ".next", "standalone", ".next", "static");
const standaloneServer = join(root, ".next", "standalone", "server.js");

if (!existsSync(standaloneServer)) {
  process.exit(0);
}
if (!existsSync(src)) {
  console.warn("[sync-standalone-static] skip: missing", src);
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log("[sync-standalone-static] ok ->", dest);
