export const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "";
export const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? "";

/** Se considera configurada la app cuando existe el secreto de Better Auth. */
export const isAuthConfigured = Boolean(BETTER_AUTH_SECRET);

export function assertAuthConfigured() {
  if (!isAuthConfigured) {
    throw new Error(
      "Better Auth no está configurado. Rellena BETTER_AUTH_SECRET en el archivo .env",
    );
  }
}
