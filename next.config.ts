import type { NextConfig } from "next";

// Security headers sent with every response. The Content-Security-Policy is set per request
// in src/proxy.ts, because it carries a fresh nonce each time.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Game artwork is loaded from Steam's and IGDB's image servers only.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "shared.fastly.steamstatic.com", pathname: "/store_item_assets/steam/apps/**" },
      { protocol: "https", hostname: "images.igdb.com", pathname: "/igdb/image/upload/**" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
