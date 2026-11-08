import type { NextConfig } from "next";

// Backend origin, server-side only. The browser always talks to this Next.js
// app; requests to /api/v1/* are proxied so auth cookies stay first-party.
const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
};

export default nextConfig;
