/** Tamaño máximo por adjunto. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const TEXT_TYPES = ["text/plain", "text/markdown", "text/csv"];

const ALLOWED_TYPES = new Set<string>([...IMAGE_TYPES, ...TEXT_TYPES, "application/pdf"]);

const TEXT_EXTENSIONS = [".txt", ".md", ".csv"];

/** Valor para el atributo `accept` del input de archivos. */
export const ATTACHMENT_ACCEPT = [
  ...IMAGE_TYPES,
  "application/pdf",
  ...TEXT_TYPES,
  ...TEXT_EXTENSIONS,
].join(",");

export function isImageMediaType(mediaType: string): boolean {
  return mediaType.startsWith("image/");
}

export function isTextMediaType(mediaType: string): boolean {
  return mediaType.startsWith("text/");
}

/** `true` si el archivo tiene un tipo admitido (por MIME o por extensión). */
export function isSupportedAttachment(file: File): boolean {
  if (file.type && ALLOWED_TYPES.has(file.type)) return true;

  const name = file.name.toLowerCase();
  return TEXT_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/** Resuelve el media type a enviar, deduciéndolo por extensión si falta. */
export function normalizeMediaType(file: File): string {
  if (file.type) return file.type;

  const name = file.name.toLowerCase();
  if (name.endsWith(".md")) return "text/markdown";
  if (name.endsWith(".csv")) return "text/csv";
  return "text/plain";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
