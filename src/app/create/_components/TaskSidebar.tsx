"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useJewelryGeneratorStore } from "@/store/jewelryGeneratorStore";
import BrandButton from "./BrandButton";

function IconTrash({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M3 6h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Square + pencil (compose), chat-sidebar style */
function IconCompose({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        cx="11"
        cy="11"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m20 20-4.3-4.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGrip({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="9" cy="6" r="1.75" />
      <circle cx="15" cy="6" r="1.75" />
      <circle cx="9" cy="12" r="1.75" />
      <circle cx="15" cy="12" r="1.75" />
      <circle cx="9" cy="18" r="1.75" />
      <circle cx="15" cy="18" r="1.75" />
    </svg>
  );
}

function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 保护：闭合挂锁，与「已保护」状态一致 */
function IconLockClosed({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M17 8h-1V6c0-2.76-2.24-5-5-5S6 3.24 6 6v2H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-7-2c0-1.1.9-2 2-2s2 .9 2 2v2H10V6z" />
    </svg>
  );
}

/** 未保护：开锁轮廓 */
function IconLockOpen({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M7 11V8a5 5 0 0 1 9.9-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M9 18l6-6-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TaskSidebar() {
  const tasks = useJewelryGeneratorStore((s) => s.tasks);
  const activeTaskId = useJewelryGeneratorStore((s) => s.activeTaskId);
  const status = useJewelryGeneratorStore((s) => s.status);
  const createNewTask = useJewelryGeneratorStore((s) => s.createNewTask);
  const syncTasksFromServer = useJewelryGeneratorStore((s) => s.syncTasksFromServer);
  const switchTask = useJewelryGeneratorStore((s) => s.switchTask);
  const renameTask = useJewelryGeneratorStore((s) => s.renameTask);
  const setTaskProtected = useJewelryGeneratorStore((s) => s.setTaskProtected);
  const deleteTask = useJewelryGeneratorStore((s) => s.deleteTask);
  const reorderTasks = useJewelryGeneratorStore((s) => s.reorderTasks);
  const error = useJewelryGeneratorStore((s) => s.error);

  const [search, setSearch] = useState("");
  const [sectionOpen, setSectionOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);
  /** 使用 fixed + portal，避免侧栏列表 overflow 裁切横向弹层 */
  const [taskMenu, setTaskMenu] = useState<{ taskId: string; top: number; left: number } | null>(
    null
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  /** 删除任务：菜单点选后的二次确认（应用内弹层，非系统 confirm） */
  const [taskDeletePending, setTaskDeletePending] = useState<{ id: string; name: string } | null>(
    null
  );

  const busyGlobal = status.step1Generating || status.step3Generating || status.step4Generating;

  const closeTaskMenu = () => setTaskMenu(null);

  useEffect(() => {
    void (async () => {
      await syncTasksFromServer();
      // 首屏只同步任务列表；工作区同步由 hydration / 切任务触发，避免首屏叠加慢请求造成卡顿。
    })();
  }, [syncTasksFromServer]);

  useEffect(() => {
    if (sidebarCollapsed) setTaskMenu(null);
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!taskMenu) return;
    const onDown = (e: MouseEvent) => {
      if (taskMenuRef.current?.contains(e.target as Node)) return;
      closeTaskMenu();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [taskMenu]);

  useEffect(() => {
    if (taskMenu && !tasks.some((x) => x.id === taskMenu.taskId)) setTaskMenu(null);
  }, [tasks, taskMenu]);

  useEffect(() => {
    if (taskDeletePending && !tasks.some((x) => x.id === taskDeletePending.id)) {
      setTaskDeletePending(null);
    }
  }, [tasks, taskDeletePending]);

  useEffect(() => {
    if (!taskDeletePending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTaskDeletePending(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [taskDeletePending]);

  /** 弹层打开时锁滚动；与 portal 配合避免 sticky 侧栏父级「吃掉」fixed 全屏层 */
  useEffect(() => {
    if (!taskDeletePending) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [taskDeletePending]);

  const searchActive = Boolean(search.trim());
  const displayTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.searchLine || "").toLowerCase().includes(q) ||
        (t.lastSuccessPrompt || "").toLowerCase().includes(q)
    );
  }, [tasks, search]);

  const startRename = (id: string, name: string) => {
    closeTaskMenu();
    setEditingId(id);
    setEditingName(name);
  };

  const commitRename = () => {
    if (!editingId) return;
    renameTask(editingId, editingName);
    setEditingId(null);
    setEditingName("");
  };

  return (
    <aside
      className={`flex min-h-0 w-full flex-col border-b border-[rgba(94,111,130,0.14)] bg-[var(--create-surface-canvas)] transition-[width,max-height] duration-200 ease-out lg:flex-1 lg:border-b-0 lg:border-r lg:border-[rgba(94,111,130,0.14)] ${
        sidebarCollapsed
          ? "max-h-[52px] overflow-hidden lg:max-h-none lg:w-12 lg:overflow-visible"
          : "lg:w-[268px]"
      }`}
    >
      <div
        className={`flex min-h-[var(--create-chrome-header-height)] shrink-0 items-center py-4 ${
          sidebarCollapsed
            ? "justify-end px-2 lg:justify-center lg:px-0"
            : "justify-between gap-2 px-3"
        }`}
      >
        {!sidebarCollapsed ? (
          <Link
            href="/create/design"
            className="min-w-0 text-left text-sm font-bold text-[#363028] transition hover:opacity-85"
          >
            创作模式
          </Link>
        ) : (
          <span className="sr-only">创作模式</span>
        )}
        <button
          type="button"
          aria-expanded={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed((c) => !c)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6b5d52] transition hover:bg-[#e8dfd4]/85 hover:text-[#3d3834]"
          title={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
          aria-label={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
        >
          {sidebarCollapsed ? (
            <IconChevronRight className="text-[#5c534c]" />
          ) : (
            <IconChevronLeft className="text-[#5c534c]" />
          )}
        </button>
      </div>

      {!sidebarCollapsed ? (
        <>
      <div className="flex flex-col gap-2.5 px-3 py-3">
        <button
          type="button"
          disabled={busy || busyGlobal}
          onClick={async () => {
            setBusy(true);
            try {
              await createNewTask();
            } finally {
              setBusy(false);
            }
          }}
          className="flex w-full items-center gap-2.5 rounded-2xl border border-[rgba(94,111,130,0.12)] bg-[var(--create-surface-paper)] px-3.5 py-2.5 text-left text-sm font-normal text-[#a89888] transition hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_12%,var(--create-surface-paper))] active:bg-[color-mix(in_srgb,var(--create-surface-tray)_22%,var(--create-surface-paper))] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <IconCompose className="h-[18px] w-[18px] shrink-0 text-[#9a9088]" />
          <span>新建任务</span>
        </button>

        <div className="flex w-full items-center gap-2.5 rounded-2xl border border-[rgba(94,111,130,0.12)] bg-[var(--create-surface-paper)] px-3.5 py-2.5 transition focus-within:bg-[color-mix(in_srgb,var(--create-surface-tray)_10%,var(--create-surface-paper))] focus-within:ring-2 focus-within:ring-[#454038]/12">
          <IconSearch className="pointer-events-none h-[18px] w-[18px] shrink-0 text-[#9a9088]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索任务"
            aria-label="搜索任务"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-normal text-[#454038] outline-none ring-0 placeholder:font-normal placeholder:text-[#a89888]"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-3">
        <button
          type="button"
          onClick={() => setSectionOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left text-sm font-bold text-[#363028] hover:bg-[#e5dcd2]/55"
        >
          <span>我的任务</span>
          <span className="text-xs font-normal text-[#9a9088]" aria-hidden>
            {sectionOpen ? "▾" : "▸"}
          </span>
        </button>

        {sectionOpen ? (
          <ul className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
            {displayTasks.map((t) => {
              const active = t.id === activeTaskId;
              const canDrag = !searchActive && !busyGlobal && editingId !== t.id;
              return (
                <li
                  key={t.id}
                  onDragOver={(e) => {
                    if (!canDrag || !draggingId || draggingId === t.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverId(t.id);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverId((id) => (id === t.id ? null : id));
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromId = e.dataTransfer.getData("text/plain");
                    setDragOverId(null);
                    setDraggingId(null);
                    if (!fromId || fromId === t.id) return;
                    reorderTasks(fromId, t.id);
                  }}
                  className={
                    dragOverId === t.id && draggingId && draggingId !== t.id
                      ? "rounded-lg ring-2 ring-[#dcb878]/55 ring-offset-2 ring-offset-[var(--create-surface-canvas)]"
                      : undefined
                  }
                >
                  <div
                    className={`group relative flex gap-0.5 rounded-lg px-1 py-[0.4rem] pl-0.5 text-[13px] leading-snug items-center ${
                      active
                        ? "bg-[var(--create-surface-paper)] shadow-[0_1px_4px_rgba(220,184,120,0.12)] ring-1 ring-[#dcb878]/42"
                        : "hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_28%,var(--create-surface-canvas))]"
                    } ${draggingId === t.id ? "opacity-60" : ""}`}
                  >
                    <div className="flex shrink-0 flex-col items-center gap-0.5 self-center">
                      <button
                        type="button"
                        draggable={canDrag}
                        title={canDrag ? "拖拽排序" : undefined}
                        aria-label={canDrag ? "拖拽排序" : undefined}
                        tabIndex={canDrag ? 0 : -1}
                        onDragStart={(e) => {
                          if (!canDrag) return;
                          e.stopPropagation();
                          setDraggingId(t.id);
                          e.dataTransfer.setData("text/plain", t.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverId(null);
                        }}
                        className={`flex items-center justify-center rounded p-[0.2rem] text-[#a89888] transition hover:bg-[#e5dcd2]/60 hover:text-[#5c534c] ${
                          canDrag ? "cursor-default" : "pointer-events-none cursor-default opacity-30"
                        }`}
                      >
                        <IconGrip />
                      </button>
                      {t.isProtected ? (
                        <span
                          className="flex h-4 w-4 items-center justify-center"
                          title="已保护"
                          aria-label="已保护，无法删除"
                        >
                          <IconLockClosed className="h-3.5 w-3.5 shrink-0 text-[#b8860b]" />
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={busy || busyGlobal}
                      onClick={async () => {
                        if (t.id === activeTaskId) return;
                        setBusy(true);
                        try {
                          await switchTask(t.id);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="min-w-0 flex-1 px-1 text-left disabled:opacity-50"
                    >
                      {editingId === t.id ? (
                        <input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") {
                              setEditingId(null);
                              setEditingName("");
                            }
                          }}
                          className="w-full rounded border border-[rgba(94,111,130,0.22)] bg-[var(--create-surface-paper)] px-1.5 py-[0.2rem] text-[13px] leading-snug text-[#3d3834]"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="truncate font-medium leading-none text-[#454038]">{t.name}</div>
                      )}
                    </button>
                    {editingId !== t.id ? (
                      <div
                        className="relative shrink-0 opacity-0 transition group-hover:opacity-100 has-[:focus-visible]:opacity-100 data-[open=true]:opacity-100"
                        data-open={taskMenu?.taskId === t.id}
                      >
                        <button
                          type="button"
                          aria-expanded={taskMenu?.taskId === t.id}
                          aria-haspopup="menu"
                          aria-label="任务操作"
                          disabled={busyGlobal}
                          className="flex h-[1.4rem] w-[1.4rem] items-center justify-center rounded-md text-[#7d756c] transition hover:bg-[#dfd7cc]/85 hover:text-[#454038] disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={(e) => {
                            e.stopPropagation();
                            const r = e.currentTarget.getBoundingClientRect();
                            setTaskMenu((cur) =>
                              cur?.taskId === t.id
                                ? null
                                : { taskId: t.id, top: r.top, left: r.right + 6 }
                            );
                          }}
                        >
                          <span className="text-lg leading-none" aria-hidden>
                            ⋯
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {typeof document !== "undefined" &&
        taskMenu &&
        (() => {
          const t = tasks.find((x) => x.id === taskMenu.taskId);
          if (!t) return null;
          const isProtected = !!t.isProtected;
          const canDelete = !busyGlobal && tasks.length > 1 && !isProtected;
          return createPortal(
            <div
              ref={taskMenuRef}
              role="menu"
              style={{ top: taskMenu.top, left: taskMenu.left }}
              className="fixed z-[200] min-w-[168px] rounded-xl border border-[#d4c9bc] bg-[#fffcf9] py-1 shadow-[0_12px_32px_rgba(45,40,36,0.18)]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                disabled={busyGlobal}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-normal text-[#2c2824] transition hover:bg-[#f0e6dc] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => startRename(t.id, t.name)}
              >
                <Image
                  src="/icons/task-rename-quill.png"
                  alt=""
                  width={16}
                  height={16}
                  className="shrink-0 object-contain"
                  aria-hidden
                />
                <span>重命名</span>
              </button>
              <button
                type="button"
                role="menuitem"
                aria-pressed={isProtected}
                disabled={busyGlobal}
                title={isProtected ? "点击取消保护后可删除该任务" : "开启后无法删除该任务"}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-normal text-[#2c2824] transition hover:bg-[#f0e6dc] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => {
                  setTaskProtected(t.id, !isProtected);
                }}
              >
                {isProtected ? (
                  <IconLockClosed className="shrink-0 text-[#b8860b]" />
                ) : (
                  <IconLockOpen className="shrink-0 text-[#7d756c]" />
                )}
                <span>{isProtected ? "取消保护" : "保护"}</span>
              </button>
              <div className="mx-2 my-0.5 h-px bg-[#e8dfd4]" aria-hidden />
              <button
                type="button"
                role="menuitem"
                disabled={!canDelete}
                title={
                  isProtected
                    ? "已保护的任务无法删除"
                    : tasks.length <= 1
                      ? "至少保留一个任务"
                      : undefined
                }
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-normal text-red-600 transition hover:bg-[#fde8e8] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => {
                  if (!canDelete) return;
                  closeTaskMenu();
                  setTaskDeletePending({ id: t.id, name: t.name });
                }}
              >
                <IconTrash className="shrink-0 text-red-600" />
                <span>删除</span>
              </button>
            </div>,
            document.body
          );
        })()}

      {error && /任务|切换|新建|删除|保护/.test(error) ? (
        <div className="border-t border-[#e8d4b8] bg-[#fdf6ed] px-3 py-2 text-xs text-[#7a4e20]">
          {error}
        </div>
      ) : null}
        </>
      ) : null}

      {typeof document !== "undefined" &&
        taskDeletePending &&
        createPortal(
          <div
            className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setTaskDeletePending(null)}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) e.preventDefault();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-delete-confirm-title"
          >
            <div
              className="w-full max-w-md rounded-2xl border border-[#d4c9bc] bg-[#fffcf9] p-5 shadow-[0_12px_32px_rgba(45,40,36,0.18)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div id="task-delete-confirm-title" className="text-sm font-bold text-[#2c2824]">
                确认删除任务
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[#454038]">
                确定删除任务「<span className="font-medium">{taskDeletePending.name}</span>
                」？该任务下的图片与本地数据将一并删除，此操作不可恢复。
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <BrandButton
                  type="button"
                  variant="outline"
                  shape="full"
                  onClick={() => setTaskDeletePending(null)}
                  className="h-[34px] px-4 text-sm"
                >
                  取消
                </BrandButton>
                <BrandButton
                  type="button"
                  variant="danger"
                  shape="full"
                  disabled={busy || busyGlobal}
                  onClick={async () => {
                    const id = taskDeletePending.id;
                    setTaskDeletePending(null);
                    setBusy(true);
                    try {
                      await deleteTask(id);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="h-[34px] px-4 text-sm"
                >
                  确认删除
                </BrandButton>
              </div>
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
}
