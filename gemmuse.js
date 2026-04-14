const fs = require("node:fs");
const path = require("node:path");
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

const R2_CONFIG = {
  accountId: requireEnv("R2_ACCOUNT_ID"),
  accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
  secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  bucketName: requireEnv("R2_BUCKET"),
  region: process.env.R2_REGION?.trim() || "auto",
};

const SUPABASE_CONFIG = {
  projectUrl: requireEnv("SUPABASE_URL"),
  anonKey: requireEnv("SUPABASE_ANON_KEY"),
};

const r2Endpoint = `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`;
const publicBaseUrl = `${r2Endpoint}/${R2_CONFIG.bucketName}`;

const r2Client = new S3Client({
  region: R2_CONFIG.region,
  endpoint: r2Endpoint,
  credentials: {
    accessKeyId: R2_CONFIG.accessKeyId,
    secretAccessKey: R2_CONFIG.secretAccessKey,
  },
  forcePathStyle: true,
});

const supabase = createClient(SUPABASE_CONFIG.projectUrl, SUPABASE_CONFIG.anonKey);

async function saveImageRecordToSupabase(filename, publicUrl) {
  const { data, error } = await supabase
    .from("images")
    .insert([{ filename, url: publicUrl }])
    .select()
    .limit(1);

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }
  return data?.[0] || null;
}

async function uploadFile(localFilePath, objectKey) {
  const absPath = path.resolve(localFilePath);
  const stat = await fs.promises.stat(absPath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${absPath}`);
  }

  const key = objectKey || path.basename(absPath);
  const fileStream = fs.createReadStream(absPath);

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
      Body: fileStream,
    })
  );

  const publicUrl = `${publicBaseUrl}/${key}`;
  const dbRow = await saveImageRecordToSupabase(key, publicUrl);

  console.log(`Uploaded: ${absPath} -> r2://${R2_CONFIG.bucketName}/${key}`);
  console.log(`Saved to Supabase images:`, dbRow);
  return { bucket: R2_CONFIG.bucketName, key, publicUrl, dbRow };
}

async function listFiles(prefix = "") {
  const result = await r2Client.send(
    new ListObjectsV2Command({
      Bucket: R2_CONFIG.bucketName,
      Prefix: prefix || undefined,
    })
  );
  const items = result.Contents || [];

  if (!items.length) {
    console.log("No files found.");
    return [];
  }

  const files = items.map((item) => ({
    key: item.Key,
    size: item.Size || 0,
    lastModified: item.LastModified || null,
  }));

  console.log(`Found ${files.length} file(s):`);
  for (const f of files) {
    console.log(`- ${f.key} (${f.size} bytes)`);
  }
  return files;
}

async function main() {
  const [, , cmd, ...args] = process.argv;

  if (cmd === "upload") {
    const localFilePath = args[0];
    const objectKey = args[1];
    if (!localFilePath) {
      console.error("Usage: node gemmuse.js upload <localFilePath> [objectKey]");
      process.exit(1);
    }
    await uploadFile(localFilePath, objectKey);
    return;
  }

  if (cmd === "list") {
    const prefix = args[0] || "";
    await listFiles(prefix);
    return;
  }

  console.log("Usage:");
  console.log("  node gemmuse.js upload <localFilePath> [objectKey]");
  console.log("  node gemmuse.js list [prefix]");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("gemmuse script failed:", err.message);
    console.error(
      "Required .env keys: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, SUPABASE_URL, SUPABASE_ANON_KEY"
    );
    process.exit(1);
  });
}

module.exports = {
  uploadFile,
  listFiles,
};

