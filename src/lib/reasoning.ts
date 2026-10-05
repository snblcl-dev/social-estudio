import type { ReasoningEffort } from "@/lib/types";

/** Valores admitidos por la opción unificada `reasoning` del AI SDK. */
export const REASONING_EFFORT_VALUES = [
  "provider-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ReasoningEffort[];

export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  "provider-default": "Predeterminado",
  none: "Desactivado",
  minimal: "Mínimo",
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  xhigh: "Muy alto",
};

export const REASONING_EFFORT_OPTIONS: { value: ReasoningEffort; label: string }[] =
  REASONING_EFFORT_VALUES.map((value) => ({
    value,
    label: REASONING_EFFORT_LABELS[value],
  }));

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "provider-default";

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORT_VALUES as readonly string[]).includes(value);
}

/** Normaliza un valor desconocido al valor por defecto. */
export function toReasoningEffort(value: string | null | undefined): ReasoningEffort {
  return value && isReasoningEffort(value) ? value : DEFAULT_REASONING_EFFORT;
}

/**
 * OpenRouter no acepta "provider-default"; se omite en ese caso y se envía el
 * resto de niveles tal cual.
 */
export function toOpenRouterEffort(
  effort: ReasoningEffort | null | undefined,
): Exclude<ReasoningEffort, "provider-default"> | undefined {
  if (!effort || effort === "provider-default") return undefined;
  return effort;
}
