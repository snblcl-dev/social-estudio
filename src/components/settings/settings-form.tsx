"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { saveSettings } from "@/app/actions/settings";
import { ModelSelect } from "@/components/model-select";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PROVIDERS, PROVIDER_IDS } from "@/lib/providers";
import type { ProviderId } from "@/lib/types";

interface SettingsFormProps {
  initial: {
    default_provider: ProviderId;
    default_model: string;
  };
}

export function SettingsForm({ initial }: SettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [provider, setProvider] = useState<ProviderId>(initial.default_provider);
  const [model, setModel] = useState(initial.default_model);

  function handleSave() {
    startTransition(async () => {
      const result = await saveSettings({
        default_provider: provider,
        default_model: model,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Ajustes guardados.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modelo por defecto</CardTitle>
        <CardDescription>
          Se usa al crear una conversación nueva. Las instrucciones de prompts de imagen ahora se
          configuran en cada perfil.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="default-provider">Proveedor por defecto</Label>
            <NativeSelect
              id="default-provider"
              value={provider}
              onChange={(event) => {
                const next = event.target.value as ProviderId;
                setProvider(next);
                setModel(PROVIDERS[next].defaultModel);
              }}
            >
              {PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>
                  {PROVIDERS[id].label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="default-model">Modelo por defecto</Label>
            <ModelSelect provider={provider} value={model} onChange={setModel} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Las instrucciones para generar los prompts de imagen (incluido el número de escenas) se
          definen en cada perfil.{" "}
          <Link href="/perfiles" className="underline underline-offset-4">
            Ir a Perfiles
          </Link>
        </p>

        <div>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            Guardar ajustes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
