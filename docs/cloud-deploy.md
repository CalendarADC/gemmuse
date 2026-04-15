# Cloud Deployment Guide

This project now supports cloud-first deployment with:

- App hosting: Vercel
- Database: Neon Postgres
- Image assets: Cloudflare R2

## 1) Create cloud resources

1. Create a Neon Postgres database and copy the connection string.
2. Create an R2 bucket (for example `jewelry-images`).
3. Create an R2 API token with object read/write permissions.
4. (Recommended) Bind a public CDN/custom domain to R2 and use it as `R2_PUBLIC_BASE_URL`.

## 2) Set environment variables

In Vercel project settings, configure:

- `LAOZHANG_API_KEY`
- `QWEN_API_KEY` (optional fallback)
- `AUTH_SECRET` (32+ random chars)
- `NEXTAUTH_URL` (your production URL, e.g. `https://app.company.com`)
- `DATABASE_URL` (Neon Postgres URL)
- `R2_ENDPOINT` (e.g. `https://<accountid>.r2.cloudflarestorage.com`)
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL` (public HTTP base used by frontend)

## 3) Prisma migration in cloud

Run once against the production database:

```bash
npx prisma generate
npx prisma db push
```

If the app shows **`The table public.Task does not exist`** (or similar Prisma errors), the cloud database was never synced: run the same commands above with **production** `DATABASE_URL` (copy from Vercel env or Neon), then redeploy if needed.

## 4) Bootstrap first admin

Run once with production env vars:

```bash
ADMIN_EMAIL=admin@company.com \
ADMIN_PASSWORD='your-strong-password' \
ADMIN_NAME='Admin' \
npm run seed:admin
```

PowerShell:

```powershell
$env:ADMIN_EMAIL="admin@company.com"
$env:ADMIN_PASSWORD="your-strong-password"
$env:ADMIN_NAME="Admin"
npm run seed:admin
```

## 5) Verify production

1. Register a normal user account (`/register`).
2. Login with admin and approve from `/admin/users`.
3. Generate Step1/Step3 images and verify returned URLs are HTTPS object-storage URLs.
4. Log in from another device and verify account access remains valid.
