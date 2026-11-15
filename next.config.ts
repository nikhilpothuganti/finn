import type { NextConfig } from "next";

// Caching is handled explicitly in src/lib/cache.ts (committed snapshots + runtime
// memo), so the app opts out of Cache Components to keep data flow predictable.
const nextConfig: NextConfig = {
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
