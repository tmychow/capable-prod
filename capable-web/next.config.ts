import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: [
    "react-markdown",
    "remark-gfm",
    "rehype-raw",
  ],
};

export default nextConfig;
