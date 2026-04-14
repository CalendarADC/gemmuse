"use client";

/** Step1 翻牌风计时：总秒数 → 分/秒 各两位（最多显示 99:59），数字变化时带 3D 翻动感 */
export default function Step1FlipClock({ totalSeconds }: { totalSeconds: number }) {
  const capped = Math.min(Math.max(0, totalSeconds), 99 * 60 + 59);
  const m = Math.floor(capped / 60);
  const s = capped % 60;

  const m10 = Math.floor(m / 10);
  const m1 = m % 10;
  const s10 = Math.floor(s / 10);
  const s1 = s % 10;

  const label = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return (
    <div
      className="step1-flip-clock-root flex items-end gap-2 sm:gap-2.5"
      role="timer"
      aria-label={`生成已进行 ${label}`}
    >
      <FlipPair tens={m10} ones={m1} unit="分" />
      <Colon />
      <FlipPair tens={s10} ones={s1} unit="秒" />
    </div>
  );
}

function Colon() {
  return (
    <div className="mb-5 flex h-8 flex-col justify-center gap-1 px-0.5" aria-hidden>
      <span className="h-1 w-1 rounded-full bg-[#363028]/70" />
      <span className="h-1 w-1 rounded-full bg-[#363028]/70" />
    </div>
  );
}

function FlipPair({ tens, ones, unit }: { tens: number; ones: number; unit: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-0.5">
        <FlipDigit value={tens} />
        <FlipDigit value={ones} />
      </div>
      <span className="text-[9px] font-semibold tracking-wide text-[#363028]/85">{unit}</span>
    </div>
  );
}

function FlipDigit({ value }: { value: number }) {
  const v = ((value % 10) + 10) % 10;
  const fullH = 34;
  const halfH = 17;

  return (
    <div className="step1-flip-digit-root" style={{ perspective: "160px" }}>
      <div key={v} className="step1-flip-digit-pop relative h-[34px] w-[26px]">
        <div
          className="absolute left-0 right-0 top-0 overflow-hidden rounded-t-[6px] border-b border-black/55 bg-gradient-to-b from-[#3f3f46] to-[#2a2a30] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          style={{ height: halfH }}
        >
          <div
            className="flex w-full items-center justify-center text-[15px] font-bold leading-none text-white tabular-nums"
            style={{ height: fullH }}
          >
            {v}
          </div>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-b-[6px] bg-gradient-to-b from-[#1a1a1e] to-[#0f0f11] shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]"
          style={{ height: halfH }}
        >
          <div
            className="flex w-full items-center justify-center text-[15px] font-bold leading-none text-white tabular-nums"
            style={{ height: fullH, marginTop: -halfH }}
          >
            {v}
          </div>
        </div>
      </div>
    </div>
  );
}
