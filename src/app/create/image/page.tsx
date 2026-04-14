import dynamic from "next/dynamic";
import { CREATE_STEP_SECTION } from "../_components/createStepShell";

const Step2Gallery = dynamic(() => import("../_components/Step2Gallery"), {
  loading: () => (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-[#7a7169]">
      加载主图组件…
    </div>
  ),
});

export default function CreateImagePage() {
  return (
    <section id="create-step-2" className={CREATE_STEP_SECTION}>
      <div className="space-y-6">
        <Step2Gallery />
      </div>
    </section>
  );
}
