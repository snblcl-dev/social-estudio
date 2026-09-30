import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Parsea una columna JSON almacenada como texto en SQLite. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Convierte fechas (`Date`) a cadenas ISO para respetar los tipos de la app,
 * que declaran los timestamps como `string`. También aplana objetos anidados.
 */
export function serializeDates<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
