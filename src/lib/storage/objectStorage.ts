import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type ObjectStorageConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
};

function getObjectStorageConfig(): ObjectStorageConfig | null {
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

function createS3Client(cfg: ObjectStorageConfig) {
  return new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export async function uploadPngBase64ToObjectStorage(args: {
  base64: string;
  key: string;
}): Promise<{ url: string; objectKey: string } | null> {
  const cfg = getObjectStorageConfig();
  if (!cfg) return null;

  const body = Buffer.from(args.base64, "base64");
  const client = createS3Client(cfg);
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
