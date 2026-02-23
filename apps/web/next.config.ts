import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@holomime/api",
    "@holomime/core",
    "@holomime/config",
    "@holomime/db",
    "@holomime/types",
    "@holomime/ui",
    "@holomime/inngest",
  ],
};

export default nextConfig;
