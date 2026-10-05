import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida autocontenida para desplegar en un VPS con Node + systemd.
  output: "standalone",
  // El motor de Prisma debe quedar fuera del bundle del servidor.
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    serverActions: {
      // Los adjuntos viajan como data URL en el historial; hay que permitir
      // cuerpos mayores que el límite por defecto (1 MB).
      bodySizeLimit: "32mb",
    },
  },
};

export default nextConfig;
