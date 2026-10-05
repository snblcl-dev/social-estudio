"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { createConversation } from "@/app/actions/conversations";
import { ModelSelect } from "@/components/model-select";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Profile, Project, ProviderKey, ProviderOption } from "@/lib/types";

interface NewConversationFormProps {
  profiles: Profile[];
  projects: Project[];
  providerOptions: ProviderOption[];
  configuredProviders: ProviderKey[];
  defaultProvider: ProviderKey;
  defaultModel: string;
}

export function NewConversationForm({
  profiles,
  projects,
  providerOptions,
  configuredProviders,
  defaultProvider,
  defaultModel,
}: NewConversationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const configured = new Set(configuredProviders);
  const availableOptions = providerOptions.filter(
    (option) => option.custom || configured.has(option.key),
  );

  const usableOptions =
    availableOptions.length > 0
      ? availableOptions
      : providerOptions.filter((option) => option.key === defaultProvider);

  const initialOption =
    usableOptions.find((option) => option.key === defaultProvider) ??
    usableOptions[0] ??
    providerOptions[0];

  const [provider, setProvider] = useState<ProviderKey>(initialOption.key);
  const [model, setModel] = useState(
    defaultProvider === initialOption.key && defaultModel
      ? defaultModel
      : initialOption.defaultModel,
  );
  const [profileId, setProfileId] = useState<string>(profiles[0]?.id ?? "");
  const [projectId, setProjectId] = useState<string>("");

  const current = providerOptions.find((option) => option.key === provider);

  function handleProviderChange(next: ProviderKey) {
    setProvider(next);
    setModel(providerOptions.find((option) => option.key === next)?.defaultModel ?? "");
  }

  function handleCreate() {
    startTransition(async () => {
      const result = await createConversation({
        profileId: profileId || null,
        projectId: projectId || null,
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="new-project">Proyecto (opcional)</Label>
        <NativeSelect
          id="new-project"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          <option value="">Sin proyecto</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-provider">Proveedor</Label>
          <NativeSelect
            id="new-provider"
            value={provider}
            onChange={(event) => handleProviderChange(event.target.value as ProviderKey)}
          >
            {usableOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.custom ? `${option.label} (personalizado)` : option.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="new-model">Modelo</Label>
          <ModelSelect
            provider={provider}
            value={model}
            onChange={setModel}
            fallbackModels={current?.suggestedModels ?? []}
            placeholder={current?.defaultModel ?? ""}
          />
        </div>
      </div>

      {configuredProviders.length === 0 && availableOptions.length === 0 ? (
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
