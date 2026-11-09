import type { VideoQuote } from "@/lib/types";

export class VideoApiError extends Error {
  status: number;
  code: string;
  retryAfterSeconds: number | null;
  body: unknown;
  quote?: VideoQuote;

  constructor(input: {
    message: string;
    status: number;
    code: string;
    retryAfterSeconds?: number | null;
    body?: unknown;
  }) {
    super(input.message);
    this.name = "VideoApiError";
    this.status = input.status;
    this.code = input.code;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
    this.body = input.body ?? null;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "La clave de Klinggiare no es válida. Revísala en Ajustes.",
  KEY_REVOKED: "La clave de Klinggiare fue revocada. Crea una nueva en Ajustes.",
  RATE_LIMITED:
    "Klinggiare limitó las peticiones por unos segundos. Espera un momento e inténtalo de nuevo.",
  RATE_LIMIT: "Klinggiare limitó las peticiones. Espera un momento e inténtalo de nuevo.",
  INVALID_JSON: "La petición al proveedor no era válida.",
  INVALID_BODY: "El proveedor no pudo leer la petición.",
  INVALID_ID: "El identificador enviado no es válido.",
  INVALID_CURSOR: "No se pudo consultar el estado de los videos.",
  BODY_TOO_LARGE: "La petición es demasiado grande.",
  FORBIDDEN: "No tienes permiso para esta operación en el proveedor.",
  UPLOAD_EXPIRED: "La subida caducó. Vuelve a subir los archivos.",
  NOT_FOUND: "El recurso no existe o no pertenece a tu cuenta.",
  NO_OUTPUT: "El video todavía no está listo.",
  IDEMPOTENCY_CONFLICT:
    "La operación ya se envió con datos distintos. Vuelve a intentarlo desde cero.",
  IDEMPOTENCY_IN_PROGRESS:
    "La generación anterior aún se está procesando. Espera unos segundos y reinténtalo.",
  PRICE_CHANGED: "El precio cambió. Revisa la nueva cotización y confirma.",
  INVALID_CONTENT_TYPE: "Formato de archivo no admitido.",
  INVALID_SIZE: "El archivo es demasiado grande o está vacío.",
  VALIDATION_ERROR: "Los datos de la generación no son válidos.",
  NO_PRICE_RULE:
    "Esa combinación de modelo, duración y resolución no tiene precio disponible.",
  TAIL_NOT_SUPPORTED: "El modelo elegido no admite imagen final.",
  INSUFFICIENT_BALANCE:
    "Saldo insuficiente en tu wallet de Klinggiare. Recarga y vuelve a intentarlo.",
  INVALID_INPUT: "La imagen o el prompt no son válidos para este modelo.",
  UPLOAD_MISSING: "El archivo no se ha subido al proveedor. Vuelve a intentarlo.",
  UPLOAD_MISMATCH: "El archivo no coincide con lo declarado. Vuelve a subirlo.",
  DUPLICATE_OBJECT: "El archivo ya se había subido.",
  INTERNAL: "Error interno del proveedor. Inténtalo de nuevo en unos segundos.",
  MAINTENANCE_MODE: "Klinggiare está en mantenimiento. Inténtalo más tarde.",
  EXECUTOR_NOT_READY:
    "El servicio de generación está ocupado. Inténtalo de nuevo en unos segundos.",
  R2_NOT_CONFIGURED:
    "El almacenamiento del proveedor no está disponible. Inténtalo más tarde.",
  NETWORK_ERROR: "No se pudo conectar con Klinggiare. Revisa tu conexión.",
  TIMEOUT: "Klinggiare tardó demasiado en responder. Inténtalo de nuevo.",
  INVALID_RESPONSE: "El proveedor devolvió una respuesta inválida.",
  MOTION_NO_CHARACTER:
    "El video de muestra no tiene una persona clara. Prueba con otro video.",
  POLICY_VIOLATION_NO_REFUND:
    "Kling rechazó el contenido por sus políticas y el importe no se reembolsó.",
  AUTO_REFUNDED: "El video falló y el importe fue reembolsado.",
  UPLOAD_FAILED: "No se pudo subir la imagen a Kling. Reinténtalo.",
  DOWNLOAD_FAILED: "No se pudo descargar el video generado. Pulsa Reintentar.",
  KLING_RATE_LIMIT: "Kling limitó la tarea. Reinténtalo más tarde.",
  KLING_SERVER_ERROR: "Error en los servidores de Kling. Reinténtalo.",
  KLING_TASK_FAILED: "Kling no pudo completar la tarea. Reinténtalo.",
  ACCOUNT_AUTH_ERROR: "La cuenta de procesamiento tuvo un problema de acceso. Reinténtalo.",
  PROXY_NETWORK_ERROR: "Error temporal de conexión con Kling. Reinténtalo.",
  TASK_SUBMISSION_BLOCKED: "Kling bloqueó temporalmente la creación de tareas. Reinténtalo.",
  TASK_QUEUE_LIMIT: "Kling está ocupado con otra tarea. Reinténtalo en unos segundos.",
  SIGNER_UNAVAILABLE: "El servicio de firma no respondió. Reinténtalo.",
  SIGNER_FAILED: "El servicio de firma rechazó la petición. Reinténtalo.",
  LOGIN_CAPTCHA: "La cuenta de procesamiento requiere verificación. Reinténtalo.",
  ACCOUNT_CREDIT_EMPTY: "La cuenta de procesamiento no tiene cuota. Reinténtalo.",
  RECOVERY_AMBIGUOUS: "El resultado es incierto. Espera, no vuelvas a crearlo.",
  INTERNAL_ERROR: "Error interno del sistema. Reinténtalo.",
  FAILED: "La generación falló en el proveedor.",
  WALLET_UNAVAILABLE: "Este proveedor no expone el saldo por API.",
};

export function videoErrorMessage(
  code: string | null | undefined,
  fallback?: string | null,
): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (fallback) return fallback;
  return "No se pudo completar la operación con el proveedor de video.";
}
