This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### AI 珠宝生成器（本项目）

- 访问：`/create`
- 环境变量：复制 `.env.local.example` 为 `.env.local`
  - `LAOZHANG_API_KEY`：Step1/Step3 图片 + **Step4 文案优先**（老张 [Chat Completions](https://docs.laozhang.ai/api-capabilities/text-generation)）；可选 `LAOZHANG_TEXT_MODEL`
  - `QWEN_API_KEY`（或 `DASHSCOPE_API_KEY`）：Step4 **备选**文案；可选 `QWEN_API_BASE_URL`、`QWEN_MODEL`
- 老张与 Qwen 都不可用时，Step4 使用规则模板兜底，仍可一键复制。

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
