import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is a fully dynamic, database-driven POS. The Cache Components
  // model (cacheComponents/partialPrefetching) is intentionally disabled in
  // favor of classic per-request dynamic rendering.
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
