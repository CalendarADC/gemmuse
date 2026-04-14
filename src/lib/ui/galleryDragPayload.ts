/**
 * Step3 画廊拖拽到 Step1 时，dataTransfer 不宜塞入超长 data URL。
 * 用短时内存 id 在同源页面内传递图片地址（data URL / http(s) / blob:）。
 */
export const GALLERY_DRAG_REF_MIME = "application/x-gemmuse-gallery-ref";

const map = new Map<string, { url: string; expires: number }>();
const TTL_MS = 120_000;
const MAX_ENTRIES = 200;

function cleanup() {
  const now = Date.now();
  for (const [k, v] of map) {
    if (v.expires < now) map.delete(k);
  }
  if (map.size > MAX_ENTRIES) {
    const sorted = [...map.entries()].sort((a, b) => a[1].expires - b[1].expires);
    while (map.size > MAX_ENTRIES / 2 && sorted.length) {
      map.delete(sorted.shift()![0]);
    }
  }
}

export function registerGalleryDragPayload(imageUrl: string): string {
  cleanup();
  const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  map.set(id, { url: imageUrl, expires: Date.now() + TTL_MS });
  return id;
}

export function consumeGalleryDragPayload(id: string): string | null {
  const v = map.get(id);
  if (!v) return null;
  map.delete(id);
  return v.url;
}
