"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useJewelryGeneratorStore } from "@/store/jewelryGeneratorStore";
import CircularSparkleGenerateButton from "./CircularSparkleGenerateButton";

export default function Step1GenerateButton() {
  const router = useRouter();
  const { prompt, status, generateMainImages, recoverStep1FromServerIfComplete } =
    useJewelryGeneratorStore();
  const loading = status.step1Generating;
  const canStart = prompt.trim().length > 0;

  useEffect(() => {
    if (!loading) return;
    const tick = () => {
      void recoverStep1FromServerIfComplete().then((ok) => {
        if (ok) router.push("/create/image");
      });
    };
    const id = window.setInterval(tick, 6000);
    void tick();
    return () => window.clearInterval(id);
  }, [loading, recoverStep1FromServerIfComplete, router]);

  return (
    <CircularSparkleGenerateButton
      canStart={canStart}
      loading={loading}
      onClick={async () => {
        const ok = await generateMainImages();
        if (ok) router.push("/create/image");
      }}
      ariaLabel="生成创意"
      title="生成创意"
    />
  );
}
