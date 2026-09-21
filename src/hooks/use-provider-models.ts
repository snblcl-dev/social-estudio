"use client";

import { useEffect, useMemo, useState } from "react";

import type { ProviderKey } from "@/lib/types";

/**
 * Carga los modelos reales del proveedor desde /api/models y los combina con la
 * lista de respaldo (modelos sugeridos o manuales). Devuelve siempre un array.
 */
export function useProviderModels(provider: ProviderKey, fallback: string[] = []) {
  const [loaded, setLoaded] = useState<Record<string, string[]>>({});

  const models = useMemo(() => {
    const fetched = loaded[provider];
    if (!fetched || fetched.length === 0) return fallback;
    return [...new Set([...fetched, ...fallback])];
  }, [loaded, provider, fallback]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetch(`/api/models?provider=${encodeURIComponent(provider)}`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data: { models?: string[] }) => {
        if (!active || !Array.isArray(data.models) || data.models.length === 0) return;

        setLoaded((current) => ({ ...current, [provider]: data.models as string[] }));
      })
      .catch(() => {
        // Mantiene la lista de respaldo.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [provider]);

  return models;
}
