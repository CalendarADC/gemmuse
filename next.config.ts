import type { NextConfig } from "next";

const standalone = process.env.NEXT_OUTPUT_STANDALONE === "1";

const nextConfig: NextConfig = {
  ...(standalone ? { output: "standalone" } : {}),
  /** Next 图片管线会加载 sharp；standalone 默认追踪不到 @img 下的原生 .node，桌面版会启动即崩。 */
  ...(standalone
    ? {
        outputFileTracingIncludes: {
          "/*": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
        },
      }
    : {}),
};

export default nextConfig;