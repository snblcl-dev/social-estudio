import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida autocontenida para desplegar en un VPS con Node + systemd.
  output: "standalone",
  // El motor de Prisma debe quedar fuera del bundle del servidor.
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
