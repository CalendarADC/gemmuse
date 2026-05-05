type ObjectStorageConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
};

function envEnabled(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "on";
}

function getObjectStorageConfig(): ObjectStorageConfig | null {
  // 桌面版要求图片仅本地保存：显式关闭 R2 上传。
  if (envEnabled(process.env.DESKTOP_LOCAL_IMAGE_STORAGE)) return null;

  const endpoint = process.env.R2_ENDPOINT?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    return null;
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey, publicBaseUrl };
}

export async function uploadPngBase64ToObjectStorage(args: {
  base64: string;
  key: string;
}): Promise<{ url: string; objectKey: string } | null> {
  const cfg = getObjectStorageConfig();
  if (!cfg) return null;

  const sdk = await import("@aws-sdk/client-s3").catch(() => null);
  if (!sdk) return null;
  const { PutObjectCommand, S3Client } = sdk;

  const body = Buffer.from(args.base64, "base64");
  const client = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: args.key,
      Body: body,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  const base = cfg.publicBaseUrl.replace(/\/+$/, "");
  const cleanKey = args.key.replace(/^\/+/, "");
  return {
    url: `${base}/${cleanKey}`,
    objectKey: cleanKey,
  };
}
