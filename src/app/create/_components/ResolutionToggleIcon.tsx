/**
 * Step1/2 分辨率切换：极速 →「2K」；高清 →「4K」。二者同一套字重与字号，仅外圈 step1CircleBtnClass 区分高亮。
 */
export default function ResolutionToggleIcon({
  speed2k,
  className,
}: {
  /** true = 极速模式（2K），false = 高清模式（4K） */
  speed2k: boolean;
  className?: string;
}) {
  const label = speed2k ? "2K" : "4K";
  return (
    <span
      className={[
        "pointer-events-none select-none text-sm font-semibold tabular-nums leading-none text-[#454038]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      {label}
    </span>
  );
}
