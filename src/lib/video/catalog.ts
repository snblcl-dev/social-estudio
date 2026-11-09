import type { VideoMode, VideoPriceRule } from "@/lib/types";

export const COMMON_ASPECT_RATIOS = ["9:16", "16:9", "1:1"];

const RESOLUTION_ORDER = ["480p", "720p", "1080p", "4k"];

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/**
 * Reglas de precio aplicables al modo y a la presencia de imagen final.
 * `motionControl` manda sobre el resto; `tailImage` solo aplica con end frame.
 */
export function rulesForMode(
  rules: VideoPriceRule[],
  mode: VideoMode,
  hasEndFrame: boolean,
): VideoPriceRule[] {
  return rules.filter((rule) => {
    if (!rule.enabled) return false;

    if (mode === "motion") return rule.motionControl;
    if (mode === "text") return rule.textToVideo && !rule.motionControl && !rule.tailImage;

    if (rule.motionControl) return false;
    return hasEndFrame ? rule.tailImage : !rule.tailImage;
  });
}

export function uniqueModels(rules: VideoPriceRule[]): string[] {
  return unique(rules.map((rule) => rule.model).filter(Boolean));
}

export function uniqueDurations(rules: VideoPriceRule[]): number[] {
  return unique(rules.map((rule) => rule.durationSeconds)).sort((a, b) => a - b);
}

export function uniqueResolutions(rules: VideoPriceRule[]): string[] {
  return unique(rules.map((rule) => rule.resolution)).sort(
    (a, b) => RESOLUTION_ORDER.indexOf(a) - RESOLUTION_ORDER.indexOf(b),
  );
}

export function uniqueAudioOptions(rules: VideoPriceRule[]): boolean[] {
  const options: boolean[] = [];
  if (rules.some((rule) => !rule.audio)) options.push(false);
  if (rules.some((rule) => rule.audio)) options.push(true);
  return options.length > 0 ? options : [false];
}

/** Si la regla usa `*`, se ofrecen los aspectos habituales. */
export function aspectOptions(rules: VideoPriceRule[]): string[] {
  const values = unique(rules.map((rule) => rule.aspectRatio));
  if (values.includes("*")) return [...COMMON_ASPECT_RATIOS];
  return values.filter((value) => value && value !== "*");
}

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}
