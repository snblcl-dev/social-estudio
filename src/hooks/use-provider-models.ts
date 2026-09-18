"use client";

import { useEffect, useState } from "react";

import { PROVIDERS } from "@/lib/providers";
import type { ProviderId } from "@/lib/types";

/**
 * Carga los modelos reales del proveedor desde /api/models y los combina
 * con la lista sugerida (fallback). Devuelve siempre un array válido.
 */
export function useProviderModels(provider: ProviderId) {
  const [loaded, setLoaded] = useState<Partial<Record<ProviderId, string[]>>>({});

  const models = loaded[provider] ?? PROVIDERS[provider].suggestedModels;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetch(`/api/models?provider=${encodeURIComponent(provider)}`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data: { models?: string[] }) => {
        if (!active || !Array.isArray(data.models) || data.models.length === 0) return;

        const merged = [...new Set([...data.models, ...PROVIDERS[provider].suggestedModels])];
        setLoaded((current) => ({ ...current, [provider]: merged }));
      })
      .catch(() => {
        // Mantiene la lista sugerida.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [provider]);

  return models;
}
