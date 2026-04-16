import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const clientDir = path.join(root, "node_modules", ".prisma", "client");
const engineWin = path.join(clientDir, "query_engine-windows.dll.node");
const indexJs = path.join(clientDir, "index.js");

function clientLooksPresent() {
  return fs.existsSync(indexJs) && fs.existsSync(engineWin);
}

const result = spawnSync("npx", ["prisma", "generate"], {
  stdio: "inherit",
  shell: true,
  cwd: root,
});

if (result.status === 0) process.exit(0);

if (clientLooksPresent()) {
  console.warn(
    "[prisma-generate-for-build] prisma generate failed (often EPERM: engine DLL locked by a running Node/Electron app). " +
      "Existing Prisma client found; continuing build. Close dev server / GemMuse Desktop and run `npx prisma generate` if you changed the schema."
  );
  process.exit(0);
}

process.exit(result.status ?? 1);
