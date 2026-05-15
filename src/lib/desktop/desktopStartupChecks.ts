import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@/lib/db";
import { getDesktopDbMode, type DesktopDbMode } from "@/lib/desktop/desktopDbMode";

export type CheckStatus = "ok" | "warn" | "error" | "skipped";

export type DesktopStartupStatus = {
  ok: boolean;
  dbMode: DesktopDbMode;
  checks: {
    server: CheckStatus;
    database: CheckStatus;
    mediaDir: CheckStatus;
    r2Bypass: CheckStatus;
    step1ExpandApiKey: CheckStatus;
  };
  paths: { mediaDir: string | null };
  detail?: string;
};

function envEnabled(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "on";
}

export async function collectDesktopStartupStatus(): Promise<DesktopStartupStatus> {
  const dbMode = getDesktopDbMode();
  const mediaRoot = process.env.GEMMUSE_LOCAL_MEDIA_DIR?.trim() ?? null;

  const checks = {
    server: "ok" as CheckStatus,
    database: "skipped" as CheckStatus,
    mediaDir: "skipped" as CheckStatus,
    r2Bypass: envEnabled(process.env.DESKTOP_LOCAL_IMAGE_STORAGE) ? ("ok" as CheckStatus) : ("skipped" as CheckStatus),
    step1ExpandApiKey: process.env.STEP1_EXPAND_API_KEY?.trim() ? ("ok" as CheckStatus) : ("warn" as CheckStatus),
  };

  if (dbMode === "off") {
    checks.database = "skipped";
  } else {
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      checks.database = "ok";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.database = dbMode === "on" ? "error" : "warn";
      if (dbMode === "on") {
        return {
          ok: false,
          dbMode,
          checks,
          paths: { mediaDir: mediaRoot },
          detail: msg,
        };
      }
    }
  }

  if (mediaRoot) {
    try {
      mkdirSync(mediaRoot, { recursive: true });
      const probe = join(mediaRoot, ".gemmuse-write-probe");
      writeFileSync(probe, "ok", "utf8");
      unlinkSync(probe);
      checks.mediaDir = "ok";
    } catch (e) {
      checks.mediaDir = "error";
      return {
        ok: false,
        dbMode,
        checks,
        paths: { mediaDir: mediaRoot },
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  } else {
    checks.mediaDir = "warn";
  }

  const c = checks as DesktopStartupStatus["checks"];
  const ok = c.database !== "error" && c.mediaDir !== "error";
  return { ok, dbMode, checks: c, paths: { mediaDir: mediaRoot } };
}
