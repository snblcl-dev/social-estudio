"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { createConversation } from "@/app/actions/conversations";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useProviderModels } from "@/hooks/use-provider-models";
import { PROVIDERS } from "@/lib/providers";
import type { Profile, ProviderId } from "@/lib/types";

interface NewConversationFormProps {
  profiles: Profile[];
  configuredProviders: ProviderId[];
  defaultProvider: ProviderId;
  defaultModel: string;
}

export function NewConversationForm({
  profiles,
  configuredProviders,
  defaultProvider,
  defaultModel,
}: NewConversationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const availableProviders =
    configuredProviders.length > 0 ? configuredProviders : ([defaultProvider] as ProviderId[]);

  const initialProvider = availableProviders.includes(defaultProvider)
    ? defaultProvider
    : availableProviders[0];

  const [provider, setProvider] = useState<ProviderId>(initialProvider);
  const [model, setModel] = useState(
    defaultProvider === initialProvider && defaultModel
      ? defaultModel
      : PROVIDERS[initialProvider].defaultModel,
  );
  const [profileId, setProfileId] = useState<string>(profiles[0]?.id ?? "");

  const models = useProviderModels(provider);

  function handleProviderChange(next: ProviderId) {
    setProvider(next);
    setModel(PROVIDERS[next].defaultModel);
  }

  function handleCreate() {
    startTransition(async () => {
      const result = await createConversation({
        profileId: profileId || null,
        provider,
        model,
      });

      if (result.error || !result.id) {
        toast.error(result.error ?? "No se pudo crear la conversación.");
        return;
      }

      router.push(`/?c=${result.id}`);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-profile">Perfil</Label>
        <NativeSelect
          id="new-profile"
          value={profileId}
          onChange={(event) => setProfileId(event.target.value)}
        >
          <option value="">Sin perfil (tono neutro)</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </NativeSelect>
        {profiles.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Todavía no tienes perfiles.{" "}
            <Link href="/perfiles" className="underline underline-offset-4">
              Crea el primero
            </Link>{" "}
            para definir el estilo de tus guiones.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-provider">Proveedor</Label>
          <NativeSelect
            id="new-provider"
            value={provider}
            onChange={(event) => handleProviderChange(event.target.value as ProviderId)}
          >
            {availableProviders.map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="new-model">Modelo</Label>
          <input
            id="new-model"
            list="new-model-options"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            placeholder={PROVIDERS[provider].defaultModel}
          />
          <datalist id="new-model-options">
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </div>
      </div>

      {configuredProviders.length === 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Aún no has guardado ninguna API key.{" "}
          <Link href="/ajustes" className="underline underline-offset-4">
            Añádela en Ajustes
          </Link>{" "}
          para poder generar contenido.
        </p>
      ) : null}

      <Button onClick={handleCreate} disabled={isPending}>
        {isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
        Crear conversación
      </Button>
    </div>
  );
}
