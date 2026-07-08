import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pin the workspace root: a stray lockfile in the home directory otherwise
  // makes Next.js guess the wrong root.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
