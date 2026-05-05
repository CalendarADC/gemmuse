/**
 * standalone 下 `dir === __dirname`（.next/standalone），Next 从 `join(dir, "public")` 读静态文件。
 * `public/icons` 等与 Vercel 同源；构建后必须拷入 standalone，否则桌面版 `/icons/*` 会 404。
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/output#how-it-works
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const src = join(root, "public");
const dest = join(root, ".next", "standalone", "public");
const standaloneServer = join(root, ".next", "standalone", "server.js");

if (!existsSync(standaloneServer)) process.exit(0);
if (!existsSync(src)) {
  console.warn("[sync-standalone-public] skip: missing", src);
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log("[sync-standalone-public] ok ->", dest);
