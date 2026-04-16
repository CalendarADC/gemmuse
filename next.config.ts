import type { NextConfig } from "next";

const standalone = process.env.NEXT_OUTPUT_STANDALONE === "1";

const nextConfig: NextConfig = {
  ...(standalone ? { output: "standalone" } : {}),
};

export default nextConfig;
