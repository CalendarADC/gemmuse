import { app, BrowserWindow, dialog, shell } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";

const DEFAULT_PORT = Number(process.env.NEXT_DESKTOP_PORT || "4310");
const NEXT_URL = process.env.NEXT_DESKTOP_URL || `http://127.0.0.1:${DEFAULT_PORT}`;

let nextProcess: ChildProcess | null = null;

/** 安装包内主进程往往没有 NODE_ENV=production，不能用 NODE_ENV 判断是否内嵌 Next。 */
function shouldRunEmbeddedNextFromMain(): boolean {
  return app.isPackaged;
}

/** Use Electron binary as Node so the bundled Next server can start (see Electron ELECTRON_RUN_AS_NODE). */
function envForBundledNodeChild(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: process.env.NODE_ENV || "production",
  };
}

function getOrCreateInstallId(): string {
  const filePath = join(app.getPath("userData"), "install-id.txt");
  if (existsSync(filePath)) {
    const v = readFileSync(filePath, "utf8").trim();
    if (v) return v;
  }
  const created = randomUUID();
  writeFileSync(filePath, created, "utf8");
  return created;
}

function buildDeviceInfo() {
  const installId = getOrCreateInstallId();
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.userInfo().username,
    installId,
  ].join("|");
  const deviceId = createHash("sha256").update(raw).digest("hex");
  const deviceName = `${os.hostname()} (${os.platform()} ${os.arch()})`;
  return { deviceId, deviceName, installId };
}

function startBundledNextServer() {
  if (!shouldRunEmbeddedNextFromMain()) return;
  if (nextProcess) return;

  const appRoot = app.getAppPath();
  const standaloneServer = join(appRoot, ".next", "standalone", "server.js");
  if (existsSync(standaloneServer)) {
    nextProcess = spawn(process.execPath, [standaloneServer], {
      cwd: join(appRoot, ".next", "standalone"),
      env: {
        ...envForBundledNodeChild(),
        PORT: String(DEFAULT_PORT),
        HOSTNAME: "127.0.0.1",
      },
      stdio: "inherit",
    });
    return;
  }

  const nextBin = require.resolve("next/dist/bin/next");
  nextProcess = spawn(process.execPath, [nextBin, "start", "-p", String(DEFAULT_PORT)], {
    cwd: appRoot,
    env: {
      ...envForBundledNodeChild(),
      PORT: String(DEFAULT_PORT),
    },
    stdio: "inherit",
  });
}

async function waitForBundledNextReady(timeoutMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(NEXT_URL, { redirect: "manual" });
      if (res.ok || res.status === 302 || res.status === 307 || res.status === 308) return true;
      if (res.status === 404) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function createWindow() {
  const preloadPath = join(__dirname, "preload.js");
  const deviceInfo = buildDeviceInfo();
  const win = new BrowserWindow({
    title: "GemMuse Desktop",
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: preloadPath,
      additionalArguments: [
        `--desktop-device-id=${deviceInfo.deviceId}`,
        `--desktop-device-name=${encodeURIComponent(deviceInfo.deviceName)}`,
      ],
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(NEXT_URL)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    if (url.startsWith(NEXT_URL)) {
      void dialog.showMessageBox(win, {
        type: "error",
        title: "GemMuse Desktop",
        message: "页面加载失败",
        detail: `${desc}（错误码 ${code}）\n地址：${url}\n请确认本机未占用端口 ${DEFAULT_PORT}，且 .env 中数据库等配置正确。`,
      });
    }
  });
  win.once("ready-to-show", () => win.show());
  void win.loadURL(NEXT_URL);
}

void app.whenReady().then(async () => {
  startBundledNextServer();
  if (shouldRunEmbeddedNextFromMain()) {
    const ok = await waitForBundledNextReady();
    if (!ok) {
      void dialog.showErrorBox(
        "GemMuse Desktop",
        `本地服务在约 2 分钟内未就绪：${NEXT_URL}\n` +
          `请检查端口 ${DEFAULT_PORT} 是否被占用，或从命令行启动本程序查看 Next 报错（数据库 DATABASE_URL、AUTH_SECRET 等）。`
      );
    }
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
});
