"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListPlusIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { deleteCustomModel, saveCustomModel } from "@/app/actions/custom-providers";
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
import { NativeSelect } from "@/components/native-select";
import type { CustomModel, ProviderKey, ProviderOption } from "@/lib/types";

interface ManualModelsPanelProps {
  models: CustomModel[];
  providerOptions: ProviderOption[];
}

export function ManualModelsPanel({ models, providerOptions }: ManualModelsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [provider, setProvider] = useState<ProviderKey>(
    providerOptions[0]?.key ?? "openai",
  );
  const [model, setModel] = useState("");
  const [modelToDelete, setModelToDelete] = useState<CustomModel | null>(null);

  const labelByProvider = new Map(providerOptions.map((option) => [option.key, option.label]));

  const grouped = models.reduce<Map<ProviderKey, CustomModel[]>>((accumulator, entry) => {
    const list = accumulator.get(entry.provider) ?? [];
    list.push(entry);
    accumulator.set(entry.provider, list);
    return accumulator;
  }, new Map());

  function handleAdd() {
    if (!model.trim()) {
      toast.error("Escribe el identificador del modelo.");
      return;
    }

    startTransition(async () => {
      const result = await saveCustomModel({ provider, model });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Modelo agregado.");
      setModel("");
      router.refresh();
    });
  }

  function handleDelete() {
    if (!modelToDelete) return;
    const id = modelToDelete.id;

    startTransition(async () => {
      const result = await deleteCustomModel(id);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Modelo eliminado.");
      setModelToDelete(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListPlusIcon className="size-4" />
          Modelos manuales
        </CardTitle>
        <CardDescription>
          Agrega modelos a mano a cualquier proveedor. Útil cuando el listado automático no los
          devuelve; aparecerán junto a los demás en el selector de modelo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="flex flex-col gap-2">
            <Label htmlFor="manual-model-provider">Proveedor</Label>
            <NativeSelect
              id="manual-model-provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value as ProviderKey)}
            >
              {providerOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.custom ? `${option.label} (personalizado)` : option.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="manual-model-name">Identificador del modelo</Label>
            <Input
              id="manual-model-name"
              value={model}
              placeholder="gpt-4o-mini"
              onChange={(event) => setModel(event.target.value)}
            />
          </div>

          <Button onClick={handleAdd} disabled={isPending}>
            {isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            Agregar
          </Button>
        </div>

        {models.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no has agregado modelos manuales.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {[...grouped.entries()].map(([providerKey, entries]) => (
              <div key={providerKey} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {labelByProvider.get(providerKey) ?? providerKey}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {entries.length}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {entries.map((entry) => (
                    <span
                      key={entry.id}
                      className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 py-1 pr-1 pl-3 font-mono text-xs"
                    >
                      {entry.model}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label={`Eliminar ${entry.model}`}
                        disabled={isPending}
                        onClick={() => setModelToDelete(entry)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={modelToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setModelToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará {modelToDelete?.model ?? ""} de la lista manual.
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
