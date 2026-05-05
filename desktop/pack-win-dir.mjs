/**
 * 目录打包到 release-win-unpacked/win-unpacked，避免占用中的 release-dist 导致失败。
 */
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outRoot = join(root, "release-win-unpacked");

if (process.platform === "win32") {
  spawnSync("taskkill", ["/F", "/IM", "GemMuseDesktop.exe", "/T"], { stdio: "ignore", shell: true });
  spawnSync("taskkill", ["/F", "/IM", "electron.exe", "/T"], { stdio: "ignore", shell: true });
}

if (existsSync(outRoot)) {
  rmSync(outRoot, { recursive: true, force: true });
}

const r = spawnSync(
  "npx",
  ["electron-builder", "--win", "--dir", "--publish", "never", "-c.directories.output=release-win-unpacked"],
  { stdio: "inherit", shell: true, cwd: root, env: process.env },
);

const code = r.status === null ? 1 : r.status ?? 1;
if (code !== 0) process.exit(code);

const winUnpacked = join(root, "release-win-unpacked", "win-unpacked");
for (const name of [".env", ".env.local", ".env.example"]) {
  const src = join(root, name);
  const dst = join(winUnpacked, name);
  if (existsSync(src)) {
    copyFileSync(src, dst);
    console.log(`[desktop:pack] copied ${name} -> win-unpacked/`);
  }
}

process.exit(0);
