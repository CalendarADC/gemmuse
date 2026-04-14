import { useJewelryGeneratorStore } from "@/store/jewelryGeneratorStore";

const MAX_REFERENCE_FILE_BYTES = 4 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 5;

function approxDecodedBytesFromDataUrl(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const b64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
  return Math.floor((b64.length * 3) / 4);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("invalid result"));
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function isLikelyImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|avif|svg)$/i.test(file.name || "");
}

export type ApplyStep1GalleryRefResult = { ok: true } | { ok: false; hint: string };

/**
 * 将画廊中的图片地址写入 Step1 参考图（与 Step1 拖放画廊分支规则一致）。
 */
export async function applyStep1ReferenceFromGalleryUrl(url: string): Promise<ApplyStep1GalleryRefResult> {
  const st = useJewelryGeneratorStore.getState();
  if (st.status.step1Generating) {
    return { ok: false, hint: "生成中无法添加参考图。" };
  }
  if (st.step1ReferenceImageDataUrls.length >= MAX_REFERENCE_IMAGES) {
    return { ok: false, hint: `最多 ${MAX_REFERENCE_IMAGES} 张参考图，请先删除一张再添加。` };
  }

  if (url.startsWith("data:image")) {
    if (approxDecodedBytesFromDataUrl(url) > MAX_REFERENCE_FILE_BYTES) {
      return {
        ok: false,
        hint: `图片需小于 ${MAX_REFERENCE_FILE_BYTES / (1024 * 1024)}MB，请压缩后重试。`,
      };
    }
    const ok = useJewelryGeneratorStore.getState().addStep1ReferenceImage(url);
    return ok ? { ok: true } : { ok: false, hint: `最多 ${MAX_REFERENCE_IMAGES} 张参考图，请先删除一张再添加。` };
  }

  if (/^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const headerType = (res.headers.get("content-type") || "").split(";")[0]?.trim() || "";
      const blobType = blob.type && blob.type !== "application/octet-stream" ? blob.type : "";
      const mime = blobType || headerType;
      const urlLooksImage = /\.(jpe?g|png|gif|webp|bmp|avif|svg)(\?|#|$)/i.test(url.split("?")[0] ?? "");
      if (!mime.startsWith("image/") && !urlLooksImage) {
        return { ok: false, hint: "链接内容不是图片，请直接拖拽图片文件或另存后再拖入。" };
      }
      if (blob.size > MAX_REFERENCE_FILE_BYTES) {
        return {
          ok: false,
          hint: `图片需小于 ${MAX_REFERENCE_FILE_BYTES / (1024 * 1024)}MB，请压缩后重试。`,
        };
      }
      const effectiveMime = mime.startsWith("image/") ? mime : "image/png";
      const ext = effectiveMime.includes("jpeg") ? "jpg" : effectiveMime.includes("webp") ? "webp" : "png";
      const file = new File([blob], `reference.${ext}`, { type: effectiveMime });
      if (!isLikelyImageFile(file)) {
        return { ok: false, hint: "下载内容不是常见图片格式。" };
      }
      const dataUrl = await readFileAsDataUrl(file);
      const ok = useJewelryGeneratorStore.getState().addStep1ReferenceImage(dataUrl);
      return ok ? { ok: true } : { ok: false, hint: `最多 ${MAX_REFERENCE_IMAGES} 张参考图，请先删除一张再添加。` };
    } catch {
      return {
        ok: false,
        hint: "无法从该链接下载图片（常被目标站禁止跨域）。请改用另存为后拖入文件。",
      };
    }
  }

  if (url.startsWith("blob:")) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      if (!blob.type.startsWith("image/") && blob.size > 0) {
        return { ok: false, hint: "拖入的内容不是图片，请换一张。" };
      }
      const mime = blob.type && blob.type.startsWith("image/") ? blob.type : "image/png";
      const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
      const file = new File([blob], `reference.${ext}`, { type: mime });
      const dataUrl = await readFileAsDataUrl(file);
      const ok = useJewelryGeneratorStore.getState().addStep1ReferenceImage(dataUrl);
      return ok ? { ok: true } : { ok: false, hint: `最多 ${MAX_REFERENCE_IMAGES} 张参考图，请先删除一张再添加。` };
    } catch {
      return { ok: false, hint: "无法读取该图片，请重试或改用另存为后拖入文件。" };
    }
  }

  return { ok: false, hint: "未识别到图片。请从画廊重新拖拽。" };
}
