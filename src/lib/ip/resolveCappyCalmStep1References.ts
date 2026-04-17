import {
  type CappyCalmMaterialPreset,
  cappyCalmReferencePublicPaths,
  detectCappyCalmMaterialPreset,
} from "@/lib/ip/cappyCalm";

const MAX_STEP1_REFS = 3;

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("readAsDataURL failed"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

/** 浏览器内将 public 静态图转为 data URL，供 /api/generate-main 使用 */
export async function fetchPublicImageAsDataUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const dataUrl = await readBlobAsDataUrl(blob);
    if (!dataUrl.startsWith("data:image/") || !/;base64,/.test(dataUrl)) return null;
    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * Step1：若文案命中 Cappy Calm + 材质，则在用户参考图之前插入官方 IP 图（最多 3 张进接口）。
 */
export async function resolveCappyCalmStep1ReferenceDataUrls(
  prompt: string,
  userDataUrls: string[]
): Promise<{
  referenceImageDataUrls: string[];
  /** 仅当官方 IP 图已成功加载并作为首图传入时使用，供服务端追加角色锁定文案 */
  cappyCalmLockPreset: CappyCalmMaterialPreset | null;
}> {
  const preset = detectCappyCalmMaterialPreset(prompt);
  if (!preset) {
    return { referenceImageDataUrls: userDataUrls.slice(0, MAX_STEP1_REFS), cappyCalmLockPreset: null };
  }
  const ipUrls: string[] = [];
  for (const path of cappyCalmReferencePublicPaths(preset)) {
    const u = await fetchPublicImageAsDataUrl(path);
    if (u) ipUrls.push(u);
  }
  if (!ipUrls.length) {
    return { referenceImageDataUrls: userDataUrls.slice(0, MAX_STEP1_REFS), cappyCalmLockPreset: null };
  }
  const merged = [...ipUrls, ...userDataUrls].slice(0, MAX_STEP1_REFS);
  return { referenceImageDataUrls: merged, cappyCalmLockPreset: preset };
}
