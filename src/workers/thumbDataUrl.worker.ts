type ThumbWorkerReq = {
  id: number;
  src: string;
  maxW: number;
  quality: number;
};

type ThumbWorkerRes = {
  id: number;
  url: string;
  error?: string;
};

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

async function buildThumbInWorker(src: string, maxW: number, quality: number): Promise<string> {
  if (!src.startsWith("data:image/")) return src;
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    return src;
  }

  const response = await fetch(src);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const ratio = bitmap.width > 0 ? bitmap.height / bitmap.width : 1;
  const w = Math.max(60, Math.min(maxW, bitmap.width || maxW));
  const h = Math.max(45, Math.round(w * ratio));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const outBlob = await canvas.convertToBlob({
    type: "image/webp",
    quality,
  });
  const b64 = arrayBufferToBase64(await outBlob.arrayBuffer());
  return `data:image/webp;base64,${b64}`;
}

self.onmessage = async (e: MessageEvent<ThumbWorkerReq>) => {
  const req = e.data;
  try {
    const url = await buildThumbInWorker(req.src, req.maxW, req.quality);
    const payload: ThumbWorkerRes = { id: req.id, url };
    self.postMessage(payload);
  } catch (error) {
    const payload: ThumbWorkerRes = {
      id: req.id,
      url: req.src,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(payload);
  }
};

export {};
