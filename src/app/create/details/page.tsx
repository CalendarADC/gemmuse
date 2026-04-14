import Step4Export from "../_components/Step4Export";
import { CREATE_STEP_SECTION } from "../_components/createStepShell";

export default function CreateDetailsPage() {
  return (
    <section id="create-step-4" className={CREATE_STEP_SECTION}>
      <div className="space-y-6">
        <Step4Export />
      </div>
    </section>
  );
}
