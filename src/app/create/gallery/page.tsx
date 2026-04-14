import dynamic from "next/dynamic";
import { CREATE_STEP_SECTION } from "../_components/createStepShell";

const Step3ImageGallery = dynamic(
  () => import("../_components/Step3ImageGallery"),
  {
    loading: () => (
      <div className="flex min-h-[48vh] items-center justify-center text-sm text-[#7a7169]">
        加载展示图组件…
      </div>
    ),
  }
);

export default function CreateGalleryPage() {
  return (
    <section id="create-step-3" className={CREATE_STEP_SECTION}>
      <div className="space-y-6">
        <Step3ImageGallery />
      </div>
    </section>
  );
}
