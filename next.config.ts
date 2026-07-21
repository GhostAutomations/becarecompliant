import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pin the workspace root: a stray lockfile in the home directory otherwise
  // makes Next.js guess the wrong root.
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // Server Actions default to a 1 MB body; logo/policy/care-plan uploads can be
    // larger. Allow up to 4 MB so a normal logo (validated <=2 MB) never 413s.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
