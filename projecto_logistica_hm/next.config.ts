import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/config/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
  // Brecha 019: cabeceras de seguridad en todas las rutas.
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
