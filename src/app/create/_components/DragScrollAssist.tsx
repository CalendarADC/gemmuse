"use client";

import { useEffect, useRef } from "react";

/**
 * 原生 HTML5 拖拽时尝试滚轮/边缘滚动（Chrome 等在 drag 期间通常不派发 wheel，Step3 已改用指针拖拽）。
 * 保留给将来带 data-drag-scroll-assist 的源使用。
 */
export default function DragScrollAssist() {
  const isDraggingRef = useRef(false);
  const edgeScrollTimerRef = useRef<number | null>(null);
  const latestPointerYRef = useRef<number | null>(null);
  const lastDragHeartbeatRef = useRef<number>(0);

  useEffect(() => {
    const stopEdgeScroll = () => {
      if (edgeScrollTimerRef.current !== null) {
        window.clearInterval(edgeScrollTimerRef.current);
        edgeScrollTimerRef.current = null;
      }
    };

    const resetDraggingState = () => {
      isDraggingRef.current = false;
      latestPointerYRef.current = null;
      lastDragHeartbeatRef.current = 0;
      stopEdgeScroll();
    };

    const startEdgeScrollIfNeeded = () => {
      if (edgeScrollTimerRef.current !== null) return;
      edgeScrollTimerRef.current = window.setInterval(() => {
        if (!isDraggingRef.current) {
          stopEdgeScroll();
          return;
        }
        const y = latestPointerYRef.current;
        if (typeof y !== "number") return;

        const zone = 110;
        const speed = 28;
        if (y < zone) {
          window.scrollBy(0, -speed);
        } else if (y > window.innerHeight - zone) {
          window.scrollBy(0, speed);
        }
      }, 16);
    };

    const onDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null;
      // 仅接管我们显式声明的“可拖拽导出”按钮，避免普通图片原生拖拽把页面拖入残留态。
      const allowed = !!target?.closest?.('[data-drag-scroll-assist="1"]');
      if (!allowed) {
        resetDraggingState();
        return;
      }
      isDraggingRef.current = true;
      lastDragHeartbeatRef.current = Date.now();
    };

    const onDragEndOrDrop = () => {
      resetDraggingState();
    };

    const onDragOver = (e: DragEvent) => {
      if (!isDraggingRef.current) return;
      latestPointerYRef.current = e.clientY;
      lastDragHeartbeatRef.current = Date.now();
      startEdgeScrollIfNeeded();
    };

    const onWheel = (e: WheelEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      // 滚轮滚动时往往没有 dragover 心跳，避免 watchdog 误判结束
      lastDragHeartbeatRef.current = Date.now();
      window.scrollBy(0, e.deltaY);
    };

    // 某些跨应用拖拽场景下浏览器可能不触发 dragend/drop，导致页面“假死”。
    // 这里用多路兜底 + 心跳超时强制复位。
    const onPointerUp = () => resetDraggingState();
    const onMouseUp = () => resetDraggingState();
    const onWindowBlur = () => resetDraggingState();
    const onWindowFocus = () => resetDraggingState();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") resetDraggingState();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") resetDraggingState();
    };

    const watchdog = window.setInterval(() => {
      if (!isDraggingRef.current) return;
      const last = lastDragHeartbeatRef.current;
      if (!last) return;
      // 1.5 秒没有任何拖拽心跳，则判定为异常残留态并解锁
      if (Date.now() - last > 1500) resetDraggingState();
    }, 500);

    window.addEventListener("dragstart", onDragStart, true);
    window.addEventListener("dragend", onDragEndOrDrop, true);
    window.addEventListener("drop", onDragEndOrDrop, true);
    window.addEventListener("dragover", onDragOver, true);
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("blur", onWindowBlur, true);
    window.addEventListener("focus", onWindowFocus, true);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("visibilitychange", onVisibilityChange, true);

    return () => {
      window.removeEventListener("dragstart", onDragStart, true);
      window.removeEventListener("dragend", onDragEndOrDrop, true);
      window.removeEventListener("drop", onDragEndOrDrop, true);
      window.removeEventListener("dragover", onDragOver, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("mouseup", onMouseUp, true);
      window.removeEventListener("blur", onWindowBlur, true);
      window.removeEventListener("focus", onWindowFocus, true);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("visibilitychange", onVisibilityChange, true);
      window.clearInterval(watchdog);
      resetDraggingState();
    };
  }, []);

  return null;
}

