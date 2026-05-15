function triggerBrowserDownload(href: string, filename: string, newTab = false): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  if (newTab) {
    a.target = "_blank";
    a.rel = "noopener";
  }
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadImage(url: string, filename: string): Promise<void> {
  if (!url) throw new Error("empty image url");

  if (url.startsWith("data:") || url.startsWith("blob:")) {
    triggerBrowserDownload(url, filename);
    return;
  }

  const isHttp = /^https?:\/\//i.test(url);
  const isLocalMedia = url.startsWith("/api/local-media/");

  if (isLocalMedia) {
    const res = await fetch(url, { method: "GET", credentials: "same-origin" });
    if (!res.ok) {
      throw new Error(`download failed (${res.status})`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      triggerBrowserDownload(objectUrl, filename);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    return;
  }

  if (!isHttp) {
    triggerBrowserDownload(url, filename, true);
    return;
  }

  const proxyUrl = `/api/download-image?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, { method: "GET", credentials: "same-origin" });
  if (!res.ok) {
    throw new Error(`download failed (${res.status})`);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    triggerBrowserDownload(objectUrl, filename);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}