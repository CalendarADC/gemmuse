/** Step2/Step3 共用：收藏星、历史叠图、全选（资源在 public/icons/step2-*.png） */

export function IconStep2Favorites({ className }: { className?: string }) {
  return (
    <img
      src="/icons/step2-favorites.png"
      alt=""
      width={18}
      height={18}
      decoding="async"
      draggable={false}
      className={["pointer-events-none h-[18px] w-[18px] shrink-0 object-contain select-none", className].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}

export function IconStep2History({ className }: { className?: string }) {
  return (
    <img
      src="/icons/step2-history.png"
      alt=""
      width={18}
      height={18}
      decoding="async"
      draggable={false}
      className={["pointer-events-none h-[18px] w-[18px] shrink-0 object-contain select-none", className].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}

export function IconStep2SelectAll({ className }: { className?: string }) {
  return (
    <img
      src="/icons/step2-select-all.png"
      alt=""
      width={18}
      height={18}
      decoding="async"
      draggable={false}
      className={["pointer-events-none h-[18px] w-[18px] shrink-0 object-contain select-none", className].filter(Boolean).join(" ")}
      aria-hidden
    />
  );
}
