import { spawnSync } from "node:child_process";

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const env = {
  ...process.env,
  NEXT_OUTPUT_STANDALONE: "1",
};

run("npm", ["run", "build"], { env });
run("npm", ["run", "desktop:compile"], { env });
run("electron-builder", ["--win", "--publish", "never"], { env });
