export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "openrouter"
  | "airai";

/**
 * Proveedor personalizado creado por el usuario. Se identifica con el prefijo
 * `custom:` seguido del uuid de la fila en `custom_providers`. Apunta a un
 * endpoint compatible con la API de OpenAI.
 */
export type CustomProviderKey = `custom:${string}`;

/** Identificador de cualquier proveedor: integrado o personalizado. */
export type ProviderKey = ProviderId | CustomProviderKey;

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Texto de ayuda sobre dónde conseguir la API key. */
  hint: string;
  keyPlaceholder: string;
  defaultModel: string;
  suggestedModels: string[];
  /** URL base para proveedores compatibles con la API de OpenAI. */
  baseURL?: string;
  /** Si es true, se usa la API de Chat Completions de OpenAI. */
  openaiCompatible?: boolean;
}

/** Tipo de perfil: guion + imagen, o solo prompts de video. */
export type ProfileType = "script" | "video";

export interface Profile {
  id: string;
  user_id: string;
  type: ProfileType;
  name: string;
  description: string | null;
  script_instructions: string;
  theme_instructions: string;
  image_prompt_instructions: string;
  video_prompt_instructions: string;
  created_at: string;
  updated_at: string;
}

/** Carpeta con nombre para agrupar conversaciones. */
export interface Project {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  default_provider: ProviderKey;
  default_model: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  user_id: string;
  provider: ProviderKey;
  encrypted_key: string;
  created_at: string;
  updated_at: string;
}

/** Nivel de esfuerzo de razonamiento unificado del AI SDK. */
export type ReasoningEffort =
  | "provider-default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface Conversation {
  id: string;
  user_id: string;
  /** "script" = perfil de guion e imagen; "video" = perfil de video. */
  profile_kind: ProfileType;
  profile_id: string | null;
  video_profile_id: string | null;
  project_id: string | null;
  title: string;
  provider: ProviderKey;
  model: string;
  show_reasoning: boolean;
  reasoning_effort: ReasoningEffort;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  /** Partes del mensaje en formato UIMessage del AI SDK. */
  parts: unknown;
  created_at: string;
}

export interface ImagePrompt {
  index: number;
  scene: string;
  prompt: string;
}

export interface Script {
  id: string;
  user_id: string;
  conversation_id: string | null;
  profile_id: string | null;
  title: string;
  content: string;
  image_prompts: ImagePrompt[];
  created_at: string;
}

export interface ApiKeySummary {
  provider: ProviderKey;
  masked: string;
  updated_at: string;
}

/** Fila de `custom_providers`: endpoint compatible con OpenAI definido por el usuario. */
export interface CustomProvider {
  id: string;
  user_id: string;
  name: string;
  base_url: string;
  default_model: string;
  created_at: string;
  updated_at: string;
}

/** Fila de `custom_models`: modelo añadido a mano a cualquier proveedor. */
export interface CustomModel {
  id: string;
  user_id: string;
  provider: ProviderKey;
  model: string;
  created_at: string;
}

/** Proveedor listo para la interfaz: integrado o personalizado. */
export interface ProviderOption {
  key: ProviderKey;
  label: string;
  defaultModel: string;
  suggestedModels: string[];
  custom: boolean;
}

/** Motor de voz de Vibi. */
export type VibiProvider = "elevenlabs" | "minimax" | "capcut";

/** Motor de voz usado para generar la locución de un guion. */
export type VoiceProvider = VibiProvider | "fishaudio";

export interface VibiVoice {
  voice_id: string;
  name: string;
  description?: string;
  preview_url?: string;
  gender?: string;
  language?: string;
  /** `true` si es una voz clonada por el usuario (solo MiniMax). */
  cloned?: boolean;
}

export interface VibiLanguage {
  code: string;
  name: string;
}

export interface VibiModel {
  model_id: string;
  name: string;
  description?: string;
}

/** Audio generado a partir de un guion con Vibi. */
export interface Voiceover {
  id: string;
  user_id: string;
  script_id: string | null;
  task_id: string;
  provider: VoiceProvider;
  voice_id: string;
  model_id: string;
  language_code: string;
  status: string;
  progress: number;
  audio_url: string | null;
  error: string | null;
  text: string;
  voice_settings: Record<string, unknown>;
  characters_used: number | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Videos generados con proveedores externos (Klinggiare, ...)
// ---------------------------------------------------------------------------

export type VideoMode = "text" | "image" | "motion";

export type VideoJobType = "text_to_video" | "image_to_video" | "motion_control";

/** Regla de precio de un proveedor de video. */
export interface VideoPriceRule {
  provider: string;
  operation: string;
  model: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  audio: boolean;
  freeAudio: boolean;
  currency: string;
  amount: number;
  textToVideo: boolean;
  motionControl: boolean;
  tailImage: boolean;
  description: string;
  enabled: boolean;
  discountBadge?: { label: string; endsAt: string };
}

export interface VideoSettings {
  model: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: "480p" | "720p" | "1080p" | "4k";
  audio: boolean;
}

export interface VideoDiscount {
  programName: string;
  kind: "percent" | "fixed";
  /** Porcentaje en basis points cuando kind = "percent"; VND cuando kind = "fixed". */
  value: number;
  originalTotal: number;
  discountTotal: number;
  finalTotal: number;
  endsAt: string;
}

export interface VideoQuote {
  perVideoAmount: number;
  originalPerVideoAmount: number;
  totalAmount: number;
  originalTotal: number;
  currency: string;
  imageCount: number;
  discount: VideoDiscount | null;
}

export interface VideoJob {
  id: string;
  user_id: string;
  provider: string;
  provider_batch_id: string | null;
  provider_job_id: string | null;
  status: string;
  job_type: VideoJobType;
  prompt: string;
  model: string;
  duration_seconds: number;
  aspect_ratio: string;
  resolution: string;
  audio: boolean;
  has_end_frame: boolean;
  thumbnail_url: string | null;
  provider_video_url: string | null;
  has_video: boolean;
  price_amount: number | null;
  price_currency: string;
  error_code: string | null;
  error_message: string | null;
  eta_ms: number | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface VideoProviderOption {
  id: string;
  label: string;
  /** Si el proveedor expone un endpoint de saldo/wallet. */
  wallet: boolean;
}

export interface VideoKeySummary {
  masked: string;
  source: "user" | "env";
}

export interface VideoWalletInfo {
  balance: number;
  heldReserve: number;
  currency: string;
}
