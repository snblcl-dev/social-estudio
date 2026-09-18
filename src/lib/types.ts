export type ProviderId = "openai" | "anthropic" | "google" | "deepseek" | "openrouter";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Texto de ayuda sobre dónde conseguir la API key. */
  hint: string;
  keyPlaceholder: string;
  defaultModel: string;
  suggestedModels: string[];
}

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  script_instructions: string;
  theme_instructions: string;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  image_prompt_instructions: string;
  default_provider: ProviderId;
  default_model: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  user_id: string;
  provider: ProviderId;
  encrypted_key: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  profile_id: string | null;
  title: string;
  provider: ProviderId;
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
  provider: ProviderId;
  masked: string;
  updated_at: string;
}
