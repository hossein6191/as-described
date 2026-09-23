import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack's on-disk cache chokes on the macOS "._" sidecar files this drive writes into .next;
  // the cache is a speed-up only, so dev runs without it (builds keep their own cache and sweep first).
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  // The delivery routes hash the contract file to check a visitor's register (lib/register-param.ts),
  // so the file ships with those functions and not only as a static asset.
  outputFileTracingIncludes: {
    "/api/packs/**": ["./public/contracts/as_described.py"],
  },
  async headers() {
    return [
      {
        // No page of this site may be shown inside another site's frame: a hidden frame over a
        // decoy could otherwise steer a connected visitor's clicks onto Release or Post bond.
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
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
