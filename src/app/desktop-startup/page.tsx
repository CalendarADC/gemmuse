"use client";

import { useCallback, useEffect, useState } from "react";

import type { CheckStatus, DesktopStartupStatus } from "@/lib/desktop/desktopStartupChecks";

const LABELS: Record<string, string> = {
  server: "内置服务",
  database: "远程数据库",
  mediaDir: "本地图片目录",
  sharp: "图像处理 (sharp)",
  r2Bypass: "跳过云存储 (R2)",
};

type RowTone = "ok" | "warn" | "err";

function rowLabel(key: string, data: DesktopStartupStatus): string {
  if (key === "database" && data.dbMode === "off") {
    return "远程数据库（本版默认不连接）";
  }
  return LABELS[key] ?? key;
}

function rowDisplay(
  key: string,
  status: CheckStatus,
  data: DesktopStartupStatus,
): { label: string; tone: RowTone } {
  if (key === "database" && data.dbMode === "off" && status === "skipped") {
    return { label: "不适用（单机）", tone: "ok" };
  }
  if (status === "skipped") {
    return { label: "不适用", tone: "warn" };
  }
  if (status === "warn") {
    return { label: "注意", tone: "warn" };
  }
  if (status === "error") {
    return { label: "失败", tone: "err" };
  }
  return { label: "正常", tone: "ok" };
}

function dotColor(tone: RowTone): string {
  if (tone === "ok") return "#12a150";
  if (tone === "warn") return "#c9a227";
  return "#d92d20";
}

export default function DesktopStartupPage() {
  const [data, setData] = useState<DesktopStartupStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/desktop/startup-status", { cache: "no-store" });
      if (!res.ok) {
        setErr(`HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "28px 32px",
        maxWidth: 520,
        margin: "0 auto",
        color: "#1a1a1a",
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>GemMuse 启动自检</h1>
      <p style={{ fontSize: 13, opacity: 0.75, margin: "0 0 20px" }}>
        检查本机存储与图像依赖。本地版默认不连接远程数据库；联网仅在调用 AI 生图等服务时。
      </p>
      {err ? (
        <p style={{ color: "#b42318", fontSize: 13 }}>{err}</p>
      ) : !data ? (
        <p style={{ fontSize: 13 }}>加载中…</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
          {(Object.entries(data.checks) as [string, CheckStatus][]).map(([key, s]) => {
            const { label, tone } = rowDisplay(key, s, data);
            return (
              <li
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: dotColor(tone),
                  }}
                />
                <span style={{ flex: 1 }}>{rowLabel(key, data)}</span>
                <span style={{ opacity: 0.65, fontSize: 11 }}>{label}</span>
              </li>
            );
          })}
        </ul>
      )}
      {data?.detail ? (
        <pre
          style={{
            marginTop: 16,
            fontSize: 11,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "#f6f6f6",
            padding: 12,
            borderRadius: 8,
          }}
        >
          {data.detail}
        </pre>
      ) : null}
      {data?.paths.mediaDir ? (
        <p style={{ marginTop: 16, fontSize: 11, opacity: 0.6, wordBreak: "break-all" }}>
          媒体目录：{data.paths.mediaDir}
        </p>
      ) : null}
      <p style={{ marginTop: 20, fontSize: 11, opacity: 0.55 }}>
        {data?.dbMode === "off"
          ? "数据库策略：off（安装包默认，单机不连远程库）"
          : `数据库策略：${data?.dbMode ?? "—"}（auto 会在有库时连接；on 要求必须可用）`}
      </p>
    </div>
  );
}
