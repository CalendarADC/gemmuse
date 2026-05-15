import { app, BrowserWindow, dialog, shell } from "electron";
import { config as loadDotenvFile } from "dotenv";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import os from "node:os";

/**
 * 默认 Roaming 目录为 `%APPDATA%\<package.json name>`，旧项目名为 jewelry-ai-generator。
 * 在任意 `getPath("userData")` 之前固定为 GemMuse，与当前 MUSE/GemMuse 工程一致。
 */
app.setPath("userData", join(app.getPath("appData"), "GemMuse"));

const DEFAULT_PORT = Number(process.env.NEXT_DESKTOP_PORT || "4310");
const NEXT_URL = process.env.NEXT_DESKTOP_URL || `http://127.0.0.1:${DEFAULT_PORT}`;

let nextProcess: ChildProcess | null = null;
let startingWindow: BrowserWindow | null = null;
let suppressNextExitDialog = false;
let nextChildExitedAbnormally = false;

/** 安装包内主进程往往没有 NODE_ENV=production，不能用 NODE_ENV 判断是否内嵌 Next。 */
function shouldRunEmbeddedNextFromMain(): boolean {
  return app.isPackaged;
}

/**
 * 打包后 Next 子进程继承主进程 `process.env`。
 * 先读 `.env.example` 作默认（很多人只维护该文件），再由 `.env` / `.env.local` / userData `.env` 覆盖。
 */
function loadPackagedDesktopEnv(): void {
  if (!app.isPackaged) return;
  const exeDir = dirname(process.execPath);
  const example = join(exeDir, ".env.example");
  const envFile = join(exeDir, ".env");
  const local = join(exeDir, ".env.local");
  const dataEnv = join(app.getPath("userData"), ".env");
  const dataLocal = join(app.getPath("userData"), ".env.local");
  if (existsSync(example)) loadDotenvFile({ path: example });
  if (existsSync(envFile)) loadDotenvFile({ path: envFile, override: true });
  if (existsSync(local)) loadDotenvFile({ path: local, override: true });
  if (existsSync(dataEnv)) loadDotenvFile({ path: dataEnv, override: true });
  if (existsSync(dataLocal)) loadDotenvFile({ path: dataLocal, override: true });
  if (!process.env.DATABASE_URL?.trim()) {
    const udExample = join(app.getPath("userData"), ".env.example");
    if (existsSync(udExample)) loadDotenvFile({ path: udExample, override: true });
  }
}

/**
 * NextAuth 在生产环境要求 secret；安装包常未带 .env，则在 userData 生成并复用同一密钥。
 */
function ensureDesktopNextAuthSecret(): void {
  if (!app.isPackaged) return;
  if (process.env.NEXTAUTH_SECRET?.trim()) {
    if (!process.env.AUTH_SECRET?.trim()) {
      process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET;
    }
    return;
  }
  if (process.env.AUTH_SECRET?.trim()) {
    process.env.NEXTAUTH_SECRET = process.env.AUTH_SECRET;
    return;
  }
  const secretPath = join(app.getPath("userData"), "nextauth-secret.txt");
  try {
    if (existsSync(secretPath)) {
      const existing = readFileSync(secretPath, "utf8").trim();
      if (existing.length >= 16) {
        process.env.NEXTAUTH_SECRET = existing;
        process.env.AUTH_SECRET = existing;
        return;
      }
    }
  } catch {
    /* ignore */
  }
  const created = randomBytes(32).toString("base64url");
  try {
    writeFileSync(secretPath, created, "utf8");
  } catch {
    /* 仍设置进程内变量；若写盘失败，重启后会重新生成 */
  }
  process.env.NEXTAUTH_SECRET = created;
  process.env.AUTH_SECRET = created;
}

/** 内置 Next 与浏览器访问同源；避免沿用线上 NEXTAUTH_URL 导致 cookie/回调异常。 */
function applyDesktopRuntimeDefaults(): void {
  if (!app.isPackaged) return;
  ensureDesktopNextAuthSecret();
  process.env.NEXTAUTH_URL = NEXT_URL;
  if (!process.env.DESKTOP_LOCAL_IMAGE_STORAGE?.trim()) {
    process.env.DESKTOP_LOCAL_IMAGE_STORAGE = "1";
  }
  /** 安装包默认不连远程数据库；exe 旁 .env 可显式设为 auto/on 覆盖。 */
  if (!process.env.DESKTOP_DB_MODE?.trim()) {
    process.env.DESKTOP_DB_MODE = "off";
  }
}

/** 打包版默认把生图 PNG 落在 userData，供 Next 内 `/api/local-media` 读取。 */
function ensureGemmuseLocalMediaDir(): void {
  if (!app.isPackaged) return;
  const dir =
    process.env.GEMMUSE_LOCAL_MEDIA_DIR?.trim() || join(app.getPath("userData"), "local-media");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  process.env.GEMMUSE_LOCAL_MEDIA_DIR = dir;
}

function nextServerLogPath(): string {
  return join(app.getPath("userData"), "next-server.log");
}

function wireBundledNextProcessLogging(child: ChildProcess): void {
  if (!app.isPackaged) return;
  const path = nextServerLogPath();
  try {
    appendFileSync(path, `\n--- ${new Date().toISOString()} ---\n`);
  } catch {
    /* ignore */
  }
  const append = (buf: Buffer) => {
    try {
      appendFileSync(path, buf);
    } catch {
      /* ignore */
    }
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
}

function readNextServerLogTail(maxBytes = 3500): string {
  try {
    const path = nextServerLogPath();
    if (!existsSync(path)) return "";
    const buf = readFileSync(path);
    const slice = buf.length > maxBytes ? buf.subarray(buf.length - maxBytes) : buf;
    return slice.toString("utf8");
  } catch {
    return "";
  }
}

/** Use Electron binary as Node so the bundled Next server can start (see Electron ELECTRON_RUN_AS_NODE). */
function envForBundledNodeChild(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: process.env.NODE_ENV || "production",
  };
}

/**
 * 打包后 `app.getAppPath()` 含 `app.asar`；`existsSync`/脚本路径可用该逻辑路径。
 * 但 Windows 上子进程 `cwd` 不能是 `…\app.asar\…` 这种「归档内伪目录」，否则 CreateProcess 失败
 *（常报 `spawn … GemMuseDesktop.exe ENOENT`）。Next standalone 的 `server.js` 会 `chdir(__dirname)`，
 * 故此处 `cwd` 用 exe 所在真实目录即可。
 */
function spawnCwdForBundledNext(standaloneDir: string): string {
  if (process.platform === "win32" && app.isPackaged) return dirname(process.execPath);
  return standaloneDir;
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

/**
 * Windows 上曾用 `shell: true` 拼整条命令行以规避「路径含空格」问题，但会强制启动
 * `%ComSpec%`（多为 cmd.exe）；若环境变量损坏或受限，会出现 `spawn cmd.exe ENOENT`。
 * Node 对 `spawn(可执行文件, argv 数组)` 会正确传参，无需经过 cmd。
 */
function spawnBundledNodeChild(
  argv: string[],
  opts: Pick<SpawnOptions, "cwd" | "env" | "stdio" | "windowsHide">,
): ChildProcess {
  /** 打包后子进程输出写入 userData/next-server.log，便于排查 sharp / Prisma 等。 */
  const stdio =
    opts.stdio ?? (app.isPackaged ? (["ignore", "pipe", "pipe"] as const) : "inherit");
  const windowsHide = opts.windowsHide ?? true;
  const child = spawn(process.execPath, argv, {
    cwd: opts.cwd,
    env: opts.env,
    stdio,
    windowsHide,
  });
  if (app.isPackaged && opts.stdio === undefined) wireBundledNextProcessLogging(child);
  return child;
}

function showPackagedStartingWindow() {
  if (!shouldRunEmbeddedNextFromMain()) return;
  if (startingWindow) return;
  const w = new BrowserWindow({
    width: 440,
    height: 420,
    show: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    title: "GemMuse 2.2",
    webPreferences: { sandbox: true },
  });
  const html =
    "<!DOCTYPE html><meta charset=utf-8><style>body{font:14px system-ui;margin:0;padding:28px;text-align:center;color:#333}</style><body>正在启动内置服务，请稍候…</body>";
  void w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  startingWindow = w;
}

function closeStartingWindow() {
  if (!startingWindow) return;
  startingWindow.close();
  startingWindow = null;
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
  const standaloneDir = join(appRoot, ".next", "standalone");
  const standaloneServer = join(standaloneDir, "server.js");
  if (existsSync(standaloneServer)) {
    nextProcess = spawnBundledNodeChild([standaloneServer], {
      cwd: spawnCwdForBundledNext(standaloneDir),
      env: {
        ...envForBundledNodeChild(),
        PORT: String(DEFAULT_PORT),
        HOSTNAME: "127.0.0.1",
      },
      windowsHide: true,
    });
    return;
  }

  const nextBin = require.resolve("next/dist/bin/next");
  nextProcess = spawnBundledNodeChild([nextBin, "start", "-p", String(DEFAULT_PORT)], {
    cwd: app.isPackaged ? dirname(process.execPath) : appRoot,
    env: {
      ...envForBundledNodeChild(),
      PORT: String(DEFAULT_PORT),
    },
    windowsHide: true,
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
    title: "GemMuse 2.2",
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
        title: "GemMuse 2.2",
        message: "页面加载失败",
        detail: `${desc}（错误码 ${code}）\n地址：${url}\n请确认本机未占用端口 ${DEFAULT_PORT}，且 .env 中数据库等配置正确。`,
      });
    }
  });
  win.once("ready-to-show", () => win.show());
  void win.loadURL(NEXT_URL);
}

void app.whenReady().then(async () => {
  loadPackagedDesktopEnv();
  applyDesktopRuntimeDefaults();
  ensureGemmuseLocalMediaDir();
  showPackagedStartingWindow();
  startBundledNextServer();
  if (nextProcess) {
    nextProcess.once("error", (err) => {
      void dialog.showErrorBox("GemMuse 2.2", `无法启动内置服务：${String(err?.message ?? err)}`);
    });
    nextProcess.once("exit", (code, signal) => {
      if (suppressNextExitDialog) return;
      if (signal === "SIGTERM" || signal === "SIGINT") return;
      if (code === 0 || code === null) return;
      nextChildExitedAbnormally = true;
      const tail = readNextServerLogTail();
      void dialog.showErrorBox(
        "GemMuse 2.2",
        `内置服务已退出（代码 ${String(code)}${signal ? `，信号 ${signal}` : ""}）。\n` +
          `配置：exe 同目录 .env / .env.example，或 ${join(app.getPath("userData"), ".env")}\n` +
          `日志：${nextServerLogPath()}\n\n` +
          (tail ? `--- 日志尾部 ---\n${tail}` : "(暂无日志；请确认已执行 npm run build 且 postbuild 已复制 sharp 原生文件后再打包。)")
      );
    });
  }
  if (shouldRunEmbeddedNextFromMain()) {
    const ok = await waitForBundledNextReady();
    if (ok && startingWindow) {
      try {
        await startingWindow.loadURL(`${NEXT_URL}/desktop-startup`);
        await new Promise((r) => setTimeout(r, 2600));
      } catch {
        /* 自检页加载失败时仍继续进入主窗 */
      }
    }
    closeStartingWindow();
    if (!ok && !nextChildExitedAbnormally) {
      const tail = readNextServerLogTail();
      void dialog.showErrorBox(
        "GemMuse 2.2",
        `本地服务在约 2 分钟内未就绪：${NEXT_URL}\n` +
          `请检查端口 ${DEFAULT_PORT}、数据库与 .env。完整日志见：${nextServerLogPath()}\n\n` +
          (tail ? tail : "")
      );
    }
  } else {
    closeStartingWindow();
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
  suppressNextExitDialog = true;
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
});
