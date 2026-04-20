"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type WindowedMountProps = {
  children: ReactNode;
  estimatedHeight: number;
  bufferPx?: number;
  enabled?: boolean;
  className?: string;
};

/**
 * Keep only viewport-near items mounted, while preserving layout height.
 */
export default function WindowedMount({
  children,
  estimatedHeight,
  bufferPx = 1000,
  enabled = true,
  className,
}: WindowedMountProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(true);
  const [cachedHeight, setCachedHeight] = useState(estimatedHeight);

  useEffect(() => {
    if (!enabled) {
      setMounted(true);
      return;
    }
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setMounted(entry.isIntersecting);
      },
      {
        root: null,
        rootMargin: `${bufferPx}px 0px ${bufferPx}px 0px`,
        threshold: 0,
      }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [bufferPx, enabled]);

  useEffect(() => {
    if (!enabled || !mounted) return;
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (h > 0) setCachedHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled, mounted]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={enabled && !mounted ? { minHeight: cachedHeight } : undefined}
    >
      {enabled && !mounted ? null : children}
    </div>
  );
}
