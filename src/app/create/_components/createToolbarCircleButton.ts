/** Step1 文本框底部工具栏圆形按钮：与其它 create 步骤复用同款尺寸与 hover/focus */
export const STEP1_CIRCLE_BTN_BASE =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2";

export function step1CircleBtnClass(emphasized: boolean, disabled: boolean) {
  if (disabled) {
    return `${STEP1_CIRCLE_BTN_BASE} pointer-events-none border-gray-200 bg-[var(--create-surface-paper)] text-gray-400 opacity-60`;
  }
  if (emphasized) {
    return `${STEP1_CIRCLE_BTN_BASE} border-amber-300 bg-amber-50 text-amber-800 shadow-sm hover:bg-amber-100`;
  }
  return `${STEP1_CIRCLE_BTN_BASE} border-[rgba(94,111,130,0.18)] bg-[var(--create-surface-paper)] text-[#454038] hover:bg-[color-mix(in_srgb,var(--create-surface-tray)_14%,var(--create-surface-paper))]`;
}
