import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack's on-disk cache chokes on the macOS "._" sidecar files this drive writes into .next;
  // the cache is a speed-up only, so dev runs without it (builds keep their own cache and sweep first).
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  async headers() {
    return [
      {
        // The contract source the /deploy page fetches; served as text so a browser shows it instead of downloading it.
        source: "/contracts/:path*",
        headers: [
          { key: "Content-Type", value: "text/plain; charset=utf-8" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
