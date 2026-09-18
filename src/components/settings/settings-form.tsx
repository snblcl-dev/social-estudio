"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { saveSettings } from "@/app/actions/settings";
import { ModelSelect } from "@/components/model-select";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PROVIDERS, PROVIDER_IDS } from "@/lib/providers";
import type { ProviderId } from "@/lib/types";

interface SettingsFormProps {
  initial: {
    image_prompt_instructions: string;
    default_provider: ProviderId;
    default_model: string;
  };
}

export function SettingsForm({ initial }: SettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [imageInstructions, setImageInstructions] = useState(
    initial.image_prompt_instructions,
  );
  const [provider, setProvider] = useState<ProviderId>(initial.default_provider);
  const [model, setModel] = useState(initial.default_model);

  function handleSave() {
    startTransition(async () => {
      const result = await saveSettings({
        image_prompt_instructions: imageInstructions,
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
        <CardTitle>Prompts de imagen</CardTitle>
        <CardDescription>
          Estas instrucciones se usan para transformar el guion en prompts de imagen. Descríbelas
          como si hablaras con un director de arte.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="image-instructions">Instrucciones para los prompts de imagen</Label>
          <Textarea
            id="image-instructions"
            rows={10}
            value={imageInstructions}
            onChange={(event) => setImageInstructions(event.target.value)}
            placeholder="Ej. Estilo cinematográfico realista, luz cálida de atardecer, planos medios, sin texto en la imagen, paleta terrosa…"
          />
        </div>

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
