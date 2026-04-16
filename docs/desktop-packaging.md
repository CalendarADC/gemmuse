# Desktop Packaging Guide (Electron)

This project can be packaged as a Windows installer using Electron + Next.js standalone output.

## 1) Prerequisites

- Windows x64
- Node.js + npm
- Valid `.env.local` (or production env file) for runtime API/database access

## 2) Install dependencies

```powershell
cd d:\jewelry-ai-generator
npm install
```

If Electron binary download was interrupted before, run:

```powershell
npm uninstall electron
npm install -D electron
```

## 3) Build installer

```powershell
npm run desktop:build
```

This command does:

1. `NEXT_OUTPUT_STANDALONE=1 npm run build`
2. `npm run desktop:compile`
3. `electron-builder --win --publish never`

Installer outputs are placed under:

- `release-dist/` (NSIS `.exe`)

## 4) Optional unpacked app (for smoke testing)

```powershell
npm run desktop:pack
```

This creates a directory build under `release/` without generating the installer.
This creates a directory build under `release-dist/` without generating the installer.

## 5) Authorization model in packaged app

- App requires server login and ACTIVE account.
- Desktop device must be approved in admin console.
- App sends heartbeat regularly; revoked devices lose access on next heartbeat.
- High-cost APIs (`generate-main`, `enhance`, `generate-copy`) require desktop token headers.

## 6) First release checklist

1. Run `npx prisma db push` on production database with latest schema.
2. Admin approves test account and desktop device.
3. Verify: login -> activate -> Step1/Step3 generation works.
4. Revoke device from admin page and confirm app is blocked on next heartbeat.
