import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Lets phones on your LAN load the dev server, e.g. DEV_ORIGINS=192.168.1.20
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((o) => o.trim()),
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
