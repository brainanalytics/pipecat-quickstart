import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable ESLint during builds (not recommended for production)
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  /* other config options here */
};

export default nextConfig;
