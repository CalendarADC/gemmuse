/** 桌面端数据库策略：off=纯本地；on=必须有库；auto=优先库失败降级 */
export type DesktopDbMode = "off" | "on" | "auto";

function envNorm(v: string | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

export function getDesktopDbMode(): DesktopDbMode {
  const raw = envNorm(process.env.DESKTOP_DB_MODE);
  if (raw === "off" || raw === "0" || raw === "false" || raw === "local") return "off";
  if (raw === "on" || raw === "1" || raw === "true" || raw === "required") return "on";
  return "auto";
}
