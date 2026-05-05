"use client";

import { useRouter } from "next/navigation";
import { useJewelryGeneratorStore } from "@/store/jewelryGeneratorStore";
import CircularSparkleGenerateButton from "./CircularSparkleGenerateButton";

export default function Step1GenerateButton({ expandBusy = false }: { expandBusy?: boolean }) {
  const router = useRouter();
  const { prompt, status, generateMainImages } = useJewelryGeneratorStore();
  const loading = status.step1Generating;
  const canStart = prompt.trim().length > 0;

  return (
    <CircularSparkleGenerateButton
      canStart={canStart}
      loading={loading}
      lockout={expandBusy}
      onClick={async () => {
        const ok = await generateMainImages();
        if (ok) router.push("/create/image");
      }}
      ariaLabel="生成创意"
      title="生成创意"
    />
  );
}