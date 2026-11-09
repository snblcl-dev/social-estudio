import { ApiKeysPanel } from "@/components/settings/api-keys-panel";
import { CustomProvidersPanel } from "@/components/settings/custom-providers-panel";
import { FishPanel } from "@/components/settings/fish-panel";
import { ManualModelsPanel } from "@/components/settings/manual-models-panel";
import { SettingsForm } from "@/components/settings/settings-form";
import { VibiPanel } from "@/components/settings/vibi-panel";
import { VideoPanel } from "@/components/settings/video-panel";
import { PageHeader } from "@/components/page-header";
import { listCustomModels, listCustomProviders } from "@/lib/data/custom-providers";
import { getFishKeySummary } from "@/lib/data/fish";
import { getSettings, listApiKeySummaries } from "@/lib/data/settings";
import { getVideoKeySummary } from "@/lib/data/video-keys";
import { getVibiKeySummary } from "@/lib/data/vibi";
import { listProviderOptions } from "@/lib/providers-server";
import { getCurrentUser } from "@/lib/session";
import type { ProviderKey } from "@/lib/types";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const [
    settings,
    keys,
    providerOptions,
    customProviders,
    customModels,
    vibiKey,
    fishKey,
    videoKey,
    magnificKey,
  ] = await Promise.all([
    getSettings(user.id),
    listApiKeySummaries(user.id),
    listProviderOptions(user.id),
    listCustomProviders(user.id),
    listCustomModels(user.id),
    getVibiKeySummary(user.id),
    getFishKeySummary(user.id),
    getVideoKeySummary(user.id, "klinggiare"),
    getVideoKeySummary(user.id, "magnific"),
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

        <FishPanel summary={fishKey} />

        <VideoPanel
          provider="klinggiare"
          title="Generación de video (Klinggiare)"
          description={
            <>
              Genera videos con Kling a través de{" "}
              <code className="font-mono">klinggiare.com</code>. El coste se descuenta del
              saldo de tu wallet en el proveedor. También puedes usar la variable de entorno{" "}
              <code className="font-mono">KLING_API_KEY</code>.
            </>
          }
          keyPlaceholder="kling_sk_..."
          envVarName="KLING_API_KEY"
          walletLabel="Klinggiare"
          walletSupported
          summary={videoKey}
        />

        <VideoPanel
          provider="magnific"
          title="Generación de video (Magnific)"
          description={
            <>
              Genera videos con los modelos Kling y Hailuo de{" "}
              <code className="font-mono">api.magnific.com</code>. Los créditos se
              descuentan al generar y el saldo se gestiona en el panel de Magnific. También
              puedes usar la variable de entorno{" "}
              <code className="font-mono">MAGNIFIC_API_KEY</code>.
            </>
          }
          keyPlaceholder="Tu clave de Magnific"
          envVarName="MAGNIFIC_API_KEY"
          walletLabel="Magnific"
          walletSupported={false}
          summary={magnificKey}
        />

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
