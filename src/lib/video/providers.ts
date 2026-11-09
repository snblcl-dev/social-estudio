import type { VideoProviderOption } from "@/lib/types";

/** Proveedores de video disponibles (client-safe: sin imports de servidor). */
export const VIDEO_PROVIDERS: VideoProviderOption[] = [
  { id: "klinggiare", label: "Kling (Klinggiare)" },
];

export const VIDEO_PROVIDER_IDS = ["klinggiare"] as const;

export type VideoProviderId = (typeof VIDEO_PROVIDER_IDS)[number];

export function isVideoProvider(value: string): value is VideoProviderId {
  return (VIDEO_PROVIDER_IDS as readonly string[]).includes(value);
}

export function videoProviderLabel(id: string): string {
  return VIDEO_PROVIDERS.find((provider) => provider.id === id)?.label ?? id;
}
