import "server-only";

import { VideoApiError } from "@/lib/video/errors";
import { klinggiareProvider } from "@/lib/video/klinggiare";
import { VIDEO_PROVIDERS, isVideoProvider } from "@/lib/video/providers";
import type { VideoProviderAdapter } from "@/lib/video/types";

const ADAPTERS: Record<string, VideoProviderAdapter> = {
  klinggiare: klinggiareProvider,
};

export function getVideoProvider(id: string): VideoProviderAdapter {
  if (!isVideoProvider(id)) {
    throw new VideoApiError({
      message: "Proveedor de video inválido.",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  }

  return ADAPTERS[id];
}

export function listVideoProviders(): VideoProviderAdapter[] {
  return VIDEO_PROVIDERS.map((provider) => ADAPTERS[provider.id]).filter(Boolean);
}
