import Step1Input from "../_components/Step1Input";
import { CREATE_STEP_SECTION } from "../_components/createStepShell";

export default function CreateDesignPage() {
  return (
    <div className="space-y-8">
      <div className="text-center py-2">
        <div className="flex items-center justify-center gap-3 md:gap-4">
          <h1 className="inline-flex items-baseline gap-2 sm:gap-3 text-3xl font-semibold font-serif tracking-tight drop-shadow-[0_0_22px_rgba(220,184,120,0.4)] sm:text-4xl md:text-5xl md:tracking-tight">
            GemMuse{" "}
            <span className="text-gold-cn-solid text-3xl font-semibold sm:text-4xl md:text-5xl">
              吉妙思
            </span>
          </h1>
        </div>
        <p className="mt-3 text-base font-medium text-[#333333]/85 md:mt-4 md:text-lg">
          Your AI muse for endless sparkle.
        </p>
      </div>

      <section id="create-step-1" className={CREATE_STEP_SECTION}>
        <div className="space-y-6">
          <div className="text-lg font-bold text-gray-900 md:text-xl">Step 1：输入创意构思</div>
          <Step1Input />
        </div>
      </section>
    </div>
  );
}
