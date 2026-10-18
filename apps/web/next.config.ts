import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  transpilePackages: ["@clearframe/contracts"],
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default config;
