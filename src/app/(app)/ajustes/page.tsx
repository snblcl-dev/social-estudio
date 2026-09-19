import { ApiKeysPanel } from "@/components/settings/api-keys-panel";
import { SettingsForm } from "@/components/settings/settings-form";
import { PageHeader } from "@/components/page-header";
import { getSettings, listApiKeySummaries } from "@/lib/data/settings";
import { isProviderId } from "@/lib/providers";
import { getCurrentUser } from "@/lib/supabase/server";
import type { ProviderId } from "@/lib/types";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const [settings, keys] = await Promise.all([
    getSettings(user.id),
    listApiKeySummaries(user.id),
  ]);

  const defaultProvider: ProviderId = isProviderId(settings.default_provider)
    ? settings.default_provider
    : "openai";

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      <PageHeader
        title="Ajustes"
        description="Configura tus claves de IA y el modelo por defecto. Las instrucciones de prompts de imagen se definen en cada perfil."
      />

      <ApiKeysPanel keys={keys} />

      <SettingsForm
        initial={{
          default_provider: defaultProvider,
          default_model: settings.default_model,
        }}
      />
    </div>
  );
}
