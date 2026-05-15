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
    sharp: CheckStatus;
    r2Bypass: CheckStatus;
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
    sharp: "skipped" as CheckStatus,
    r2Bypass: envEnabled(process.env.DESKTOP_LOCAL_IMAGE_STORAGE) ? ("ok" as CheckStatus) : ("skipped" as CheckStatus),
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

  try {
    const sharpMod = await import("sharp").catch(() => null);
    if (!sharpMod?.default) {
      checks.sharp = "error";
      return {
        ok: false,
        dbMode,
        checks,
        paths: { mediaDir: mediaRoot },
        detail: "sharp 模块无法加载",
      };
    }
    await sharpMod
      .default({
        create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
      .png()
      .toBuffer();
    checks.sharp = "ok";
  } catch (e) {
    checks.sharp = "error";
    return {
      ok: false,
      dbMode,
      checks,
      paths: { mediaDir: mediaRoot },
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  const c = checks as DesktopStartupStatus["checks"];
  const ok = c.database !== "error" && c.mediaDir !== "error" && c.sharp !== "error";
  return { ok, dbMode, checks: c, paths: { mediaDir: mediaRoot } };
}
