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

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  script_instructions: string;
  theme_instructions: string;
  image_prompt_instructions: string;
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

export interface Conversation {
  id: string;
  user_id: string;
  profile_id: string | null;
  title: string;
  provider: ProviderKey;
  model: string;
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
