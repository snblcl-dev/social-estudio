"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PencilIcon, PlusIcon, ServerIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { deleteCustomProvider, saveCustomProvider } from "@/app/actions/custom-providers";
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
import { toCustomProviderKey } from "@/lib/providers";
import type { ApiKeySummary, CustomProvider } from "@/lib/types";

interface CustomProvidersPanelProps {
  providers: CustomProvider[];
  keys: ApiKeySummary[];
}

const EMPTY_FORM = { name: "", baseUrl: "", defaultModel: "", apiKey: "" };

export function CustomProvidersPanel({ providers, keys }: CustomProvidersPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [providerToDelete, setProviderToDelete] = useState<CustomProvider | null>(null);

  const keyByProvider = new Map(keys.map((key) => [key.provider, key]));

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function startEdit(provider: CustomProvider) {
    setEditingId(provider.id);
    setForm({
      name: provider.name,
      baseUrl: provider.base_url,
      defaultModel: provider.default_model,
      apiKey: "",
    });
  }

  function handleSave() {
    if (!form.name.trim() || !form.baseUrl.trim()) {
      toast.error("Completa el nombre y la URL base.");
      return;
    }

    startTransition(async () => {
      const result = await saveCustomProvider({
        id: editingId ?? undefined,
        name: form.name,
        baseUrl: form.baseUrl,
        defaultModel: form.defaultModel,
        apiKey: form.apiKey,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(editingId ? "Proveedor actualizado." : "Proveedor agregado.");
      resetForm();
      router.refresh();
    });
  }

  function handleDelete() {
    if (!providerToDelete) return;
    const id = providerToDelete.id;

    startTransition(async () => {
      const result = await deleteCustomProvider(id);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Proveedor eliminado.");
      setProviderToDelete(null);
      if (editingId === id) resetForm();
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ServerIcon className="size-4" />
          Proveedores personalizados
        </CardTitle>
        <CardDescription>
          Agrega cualquier servicio compatible con la API de OpenAI (endpoint propio). Se usará{" "}
          <code className="font-mono">/models</code> y{" "}
          <code className="font-mono">/chat/completions</code> sobre tu URL base.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 rounded-lg border border-border/60 bg-muted/30 p-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-provider-name">Nombre</Label>
            <Input
              id="custom-provider-name"
              value={form.name}
              placeholder="Mi servidor"
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-provider-url">URL base (compatible con OpenAI)</Label>
            <Input
              id="custom-provider-url"
              value={form.baseUrl}
              placeholder="https://mi-servidor.com/v1"
              onChange={(event) =>
                setForm((current) => ({ ...current, baseUrl: event.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-provider-model">Modelo por defecto (opcional)</Label>
            <Input
              id="custom-provider-model"
              value={form.defaultModel}
              placeholder="gpt-4o-mini"
              onChange={(event) =>
                setForm((current) => ({ ...current, defaultModel: event.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-provider-key">Clave de API (opcional)</Label>
            <Input
              id="custom-provider-key"
              type="password"
              autoComplete="off"
              value={form.apiKey}
              placeholder={editingId ? "Dejar en blanco para mantener" : "sk-..."}
              onChange={(event) =>
                setForm((current) => ({ ...current, apiKey: event.target.value }))
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2Icon className="animate-spin" /> : editingId ? null : <PlusIcon />}
              {editingId ? "Guardar cambios" : "Agregar proveedor"}
            </Button>
            {editingId ? (
              <Button variant="ghost" onClick={resetForm} disabled={isPending}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>

        {providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no tienes proveedores personalizados.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {providers.map((provider) => {
              const key = keyByProvider.get(toCustomProviderKey(provider.id));

              return (
                <div
                  key={provider.id}
                  className="flex flex-col gap-3 rounded-lg border border-border/60 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{provider.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      Personalizado
                    </Badge>
                    {key ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {key.masked}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Sin clave
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span className="font-mono break-all">{provider.base_url}</span>
                    <span>
                      Modelo por defecto: {provider.default_model || "sin definir"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(provider)}
                      disabled={isPending}
                    >
                      <PencilIcon />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setProviderToDelete(provider)}
                      disabled={isPending}
                    >
                      <Trash2Icon />
                      Eliminar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={providerToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setProviderToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el proveedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará {providerToDelete?.name ?? ""}, su clave de API y los modelos
              agregados a mano para este proveedor.
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
