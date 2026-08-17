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
  // Baseline security response headers (Final Testing Part 2, 17 Aug 2026).
  // The pen-test found these absent: a compliance app that approves and completes
  // records should not be frameable (clickjacking), should not MIME-sniff, and should
  // not leak record IDs in the Referer. HSTS is already set by the platform.
  // A Content-Security-Policy is deliberately NOT added here yet: a blocking policy
  // needs to be built with nonces so it does not break Next.js inline scripts, and
  // that is its own tested change. These four are safe for every route.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
