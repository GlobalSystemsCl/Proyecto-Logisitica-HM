import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    agentUpgrade: 'security',
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
};

export default nextConfig;
