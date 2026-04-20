import { fetchWithRetry } from "@/lib/fetchWithRetry";

import type { GeneratorTask } from "@/store/jewelryGeneratorTypes";

type ServerTask = {
  id: string;
  name: string;
  searchLine: string;
  isProtected: boolean;
  sortOrder: number;
  currentStep: "STEP1" | "STEP2" | "STEP3" | "STEP4";
  createdAt: string;
  updatedAt: string;
};

export async function fetchServerTasks(): Promise<GeneratorTask[]> {
  const res = await fetchWithRetry(
    "/api/tasks",
    { method: "GET" },
    { retries: 2, baseDelayMs: 400, timeoutMs: 12_000 }
  );
  if (!res.ok) throw new Error(`任务同步失败（HTTP ${res.status}）`);
  const data = (await res.json().catch(() => ({}))) as { tasks?: ServerTask[] };
  const raw = Array.isArray(data.tasks) ? data.tasks : [];
  return raw.map((t) => ({
    id: t.id,
    name: t.name,
    searchLine: t.searchLine,
    isProtected: t.isProtected,
    sortOrder: t.sortOrder,
    currentStep: t.currentStep,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
}
