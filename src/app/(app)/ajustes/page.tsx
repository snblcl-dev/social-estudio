import { ApiKeysPanel } from "@/components/settings/api-keys-panel";
import { CustomProvidersPanel } from "@/components/settings/custom-providers-panel";
import { ManualModelsPanel } from "@/components/settings/manual-models-panel";
import { SettingsForm } from "@/components/settings/settings-form";
import { VibiPanel } from "@/components/settings/vibi-panel";
import { PageHeader } from "@/components/page-header";
import { listCustomModels, listCustomProviders } from "@/lib/data/custom-providers";
import { getSettings, listApiKeySummaries } from "@/lib/data/settings";
import { getVibiKeySummary } from "@/lib/data/vibi";
import { listProviderOptions } from "@/lib/providers-server";
import { getCurrentUser } from "@/lib/supabase/server";
import type { ProviderKey } from "@/lib/types";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const [settings, keys, providerOptions, customProviders, customModels, vibiKey] =
    await Promise.all([
      getSettings(user.id),
      listApiKeySummaries(user.id),
      listProviderOptions(user.id),
      listCustomProviders(user.id),
      listCustomModels(user.id),
      getVibiKeySummary(user.id),
    ]);

  const defaultProvider: ProviderKey = providerOptions.some(
    (option) => option.key === settings.default_provider,
  )
    ? settings.default_provider
    : (providerOptions[0]?.key ?? "openai");

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Ajustes"
          description="Configura tus claves de IA, agrega proveedores compatibles con OpenAI y define el modelo por defecto. Las instrucciones de prompts de imagen se definen en cada perfil."
        />

        <ApiKeysPanel keys={keys} />

        <CustomProvidersPanel providers={customProviders} keys={keys} />

        <ManualModelsPanel models={customModels} providerOptions={providerOptions} />

        <VibiPanel summary={vibiKey} />

        <SettingsForm
          initial={{
            default_provider: defaultProvider,
            default_model: settings.default_model,
          }}
          providerOptions={providerOptions}
        />
      </div>
    </div>
  );
}
