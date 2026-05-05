"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useJewelryGeneratorStore } from "@/store/jewelryGeneratorStore";
import {
  getClientLaozhangApiKeySnapshot,
  hydrateLaozhangApiKeyFromIndexedDb,
  readClientLaozhangApiKey,
  subscribeClientLaozhangApiKey,
  writeClientLaozhangApiKey,
} from "@/lib/laozhangKeyClientStorage";
import { emitToast } from "@/lib/ui/toast";

export default function ApiKeyPillButton() {
  const laozhangApiKey = useJewelryGeneratorStore((s) => s.laozhangApiKey);
  const setLaozhangApiKey = useJewelryGeneratorStore((s) => s.setLaozhangApiKey);
  const [open, setOpen] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const persistedProbe = useSyncExternalStore(
    subscribeClientLaozhangApiKey,
    getClientLaozhangApiKeySnapshot,
    () => ""
  );
  const hasApiKey =
    laozhangApiKey.trim().length > 0 || persistedProbe.trim().length > 0;
  const hoverText = hasApiKey ? "已经激活，点击可更换api" : "请输入可用的api";

  useEffect(() => {
    void hydrateLaozhangApiKeyFromIndexedDb().then(() => {
      const k = readClientLaozhangApiKey().trim();
      if (!k) return;
      if (!useJewelryGeneratorStore.getState().laozhangApiKey.trim()) {
        useJewelryGeneratorStore.setState({ laozhangApiKey: k });
      }
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraftKey(laozhangApiKey.trim() || readClientLaozhangApiKey());
  }, [laozhangApiKey, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const onSave = () => {
    const fromDom = inputRef.current?.value ?? "";
    const next = (fromDom.trim() || draftKey.trim());
    if (!next) {
      emitToast({
        type: "info",
        message: "请先输入 LaoZhang API Key 再保存。",
        durationMs: 3800,
      });
      return;
    }
    writeClientLaozhangApiKey(next);
    setDraftKey(next);
    setLaozhangApiKey(next);
    setOpen(false);
    emitToast({ type: "success", message: "密钥已保存。", durationMs: 2200 });
  };

  /** 与 `CreateStepNav` 外层托盘一致，避免左侧高饱和色块与整页暖灰 UI 冲突 */
  const trayClass =
    "inline-flex shrink-0 rounded-full border border-[rgba(94,111,130,0.18)] bg-[color-mix(in_srgb,var(--create-surface-tray)_42%,var(--create-surface-canvas))] p-1 shadow-sm backdrop-blur-sm";

  const innerClass = hasApiKey
    ? "bg-[var(--create-surface-paper)] text-[#2c2824] shadow-sm ring-1 ring-[rgba(94,111,130,0.12)] hover:bg-[var(--create-surface-paper)]"
    : [
        "text-[#5c534c] ring-1 ring-[color-mix(in_srgb,#d97706_22%,rgba(94,111,130,0.18))]",
        "bg-[color-mix(in_srgb,var(--create-surface-paper)_48%,transparent)]",
        "hover:bg-[color-mix(in_srgb,var(--create-surface-paper)_62%,transparent)] hover:text-[#2c2824]",
      ].join(" ");

  return (
    <div ref={rootRef} className="relative">
      <div className={trayClass}>
        <button
          type="button"
          title={hoverText}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center rounded-full px-3.5 py-2 text-sm font-semibold transition sm:px-4 ${innerClass} ${
            hasApiKey ? "" : "gap-2"
          }`}
        >
          {!hasApiKey ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600/70" aria-hidden />
          ) : null}
          密钥
        </button>
      </div>
      {open ? (
        <div className="absolute left-0 top-full z-[60] mt-2 w-[min(85vw,320px)] rounded-2xl border border-[rgba(94,111,130,0.2)] bg-[var(--create-surface-paper)] p-3 shadow-xl">
          <label htmlFor="header-api-key-input" className="mb-2 block text-xs font-medium text-zinc-700">
            输入 API Key
          </label>
          <input
            ref={inputRef}
            id="header-api-key-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSave();
              }
            }}
            placeholder="sk-..."
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-blue-300 placeholder:text-zinc-400 focus:border-blue-300 focus:ring-2"
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftKey("");
                writeClientLaozhangApiKey("");
                setLaozhangApiKey("");
                setOpen(false);
              }}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
            >
              清空
            </button>
            <button
              type="button"
              onClick={onSave}
              className="rounded-full bg-[#2c2824] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1f1b18]"
            >
              保存
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
