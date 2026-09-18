"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { deleteApiKey, saveApiKey } from "@/app/actions/settings";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROVIDERS, PROVIDER_IDS } from "@/lib/providers";
import type { ApiKeySummary, ProviderId } from "@/lib/types";

interface ApiKeysPanelProps {
  keys: ApiKeySummary[];
}

export function ApiKeysPanel({ keys }: ApiKeysPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({});
  const [providerToDelete, setProviderToDelete] = useState<ProviderId | null>(null);

  const configured = new Map(keys.map((key) => [key.provider, key]));

  function handleSave(provider: ProviderId) {
    const apiKey = drafts[provider]?.trim() ?? "";

    if (!apiKey) {
      toast.error("Pega una clave antes de guardar.");
      return;
    }

    startTransition(async () => {
      const result = await saveApiKey({ provider, apiKey });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setDrafts((current) => ({ ...current, [provider]: "" }));
      toast.success(`Clave de ${PROVIDERS[provider].label} guardada y cifrada.`);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!providerToDelete) return;
    const provider = providerToDelete;

    startTransition(async () => {
      const result = await deleteApiKey(provider);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Clave eliminada.");
      setProviderToDelete(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          Claves de IA
        </CardTitle>
        <CardDescription>
          Se guardan cifradas con AES-256-GCM en tu base de datos y nunca se envían al navegador.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {PROVIDER_IDS.map((providerId) => {
          const info = PROVIDERS[providerId];
          const existing = configured.get(providerId);

          return (
            <div key={providerId} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={`key-${providerId}`}>{info.label}</Label>
                {existing ? (
                  <Badge variant="secondary" className="font-mono text-xs">
                    {existing.masked}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Sin configurar
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Input
                  id={`key-${providerId}`}
                  type="password"
                  autoComplete="off"
                  className="min-w-64 flex-1"
                  placeholder={info.keyPlaceholder}
                  value={drafts[providerId] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [providerId]: event.target.value }))
                  }
                />
                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={() => handleSave(providerId)}
                >
                  {isPending ? <Loader2Icon className="animate-spin" /> : null}
                  Guardar
                </Button>
                {existing ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Eliminar clave de ${info.label}`}
                    onClick={() => setProviderToDelete(providerId)}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">{info.hint}</p>
            </div>
          );
        })}
      </CardContent>

      <AlertDialog
        open={providerToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setProviderToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la clave?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará la clave de {providerToDelete ? PROVIDERS[providerToDelete].label : ""}.
              No podrás generar contenido con ese proveedor hasta que añadas otra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
