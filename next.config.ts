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
        // Every path but /embed/*, which has the rule below.
        source: "/:path((?!embed(?:/|$)).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          // /contracts/as_described.py is served as text/plain so a browser shows it, and /deploy
          // fetches it; without this a browser is free to sniff that response into another type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // An order page is opened with ?tx=<hash>; a click through to the explorer must not
          // carry the whole URL, only the origin.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // The listing card other sites put in an iframe (app/embed/[id]). Any site may frame it,
        // because there is nothing in it a hidden frame could steer: it renders no wallet, signs
        // nothing, and its only controls are links that open this site in a new tab.
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
