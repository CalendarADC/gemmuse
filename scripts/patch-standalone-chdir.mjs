/**
 * Electron 打包后 `server.js` 位于 `app.asar` 内时，`process.chdir(__dirname)` 在 Windows 上会 ENOENT。
 * 父进程已将 cwd 设为 exe 目录；此处跳过失败的 chdir，由 Next 使用 `dir` 参数继续启动。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const server = join(process.cwd(), ".next", "standalone", "server.js");
let s;
try {
  s = readFileSync(server, "utf8");
} catch {
  process.exit(0);
}

const marker = "Electron+asar: chdir into archive fails";
if (s.includes(marker)) {
  console.log("[patch-standalone-chdir] already applied");
  process.exit(0);
}

const needle = "process.chdir(__dirname)";
if (!s.includes(needle)) {
  console.warn("[patch-standalone-chdir] pattern not found, skip");
  process.exit(0);
}

const replacement = `try {\n  ${needle}\n} catch {\n  /* Electron+asar: chdir into archive fails on Windows (ENOENT). */\n}`;
writeFileSync(server, s.replace(needle, replacement), "utf8");
console.log("[patch-standalone-chdir] ok");
