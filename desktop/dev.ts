import { spawn } from "node:child_process";

const PORT = Number(process.env.NEXT_DESKTOP_PORT || "4310");
const URL = `http://127.0.0.1:${PORT}`;
const isWin = process.platform === "win32";

async function waitForNext(url: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(`Next dev server did not become ready within ${timeoutMs}ms`);
}

async function main() {
  const nextDev = spawn(
    isWin ? "npm.cmd" : "npm",
    ["run", "dev", "--", "-p", String(PORT)],
    { stdio: "inherit", env: process.env }
  );

  try {
    await waitForNext(URL);
  } catch (e) {
    nextDev.kill();
    throw e;
  }

  const electron = spawn(
    isWin ? "npx.cmd" : "npx",
    ["electron", "-r", "tsx/cjs", "desktop/main.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_DESKTOP_URL: URL,
        NEXT_DESKTOP_PORT: String(PORT),
      },
    }
  );

  const closeAll = () => {
    electron.kill();
    nextDev.kill();
  };
  electron.on("exit", closeAll);
  nextDev.on("exit", () => electron.kill());
}

void main();
