/**
 * Next standalone 的 file tracing 常漏掉 @img/sharp-win32-x64 下的 .node，导致桌面 / 本机 node server.js 启动即崩。
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const fromLib = join(root, "node_modules", "@img", "sharp-win32-x64", "lib");
const standaloneServer = join(root, ".next", "standalone", "server.js");
const toLib = join(root, ".next", "standalone", "node_modules", "@img", "sharp-win32-x64", "lib");

if (!existsSync(standaloneServer)) {
  process.exit(0);
}
if (!existsSync(fromLib)) {
  console.warn("[copy-sharp-native] skip: missing", fromLib);
  process.exit(0);
}

mkdirSync(dirname(toLib), { recursive: true });
cpSync(fromLib, toLib, { recursive: true });
console.log("[copy-sharp-native] ok ->", toLib);
