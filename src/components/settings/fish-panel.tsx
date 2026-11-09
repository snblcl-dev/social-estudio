"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, Trash2Icon, Volume2Icon } from "lucide-react";
import { toast } from "sonner";

import { deleteFishKey, saveFishKey } from "@/app/actions/fish";
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

interface FishPanelProps {
  summary: { masked: string } | null;
}

export function FishPanel({ summary }: FishPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSave() {
    if (!apiKey.trim()) {
      toast.error("Pega tu clave de Fish Audio antes de guardar.");
      return;
    }

    startTransition(async () => {
      const result = await saveFishKey({ apiKey });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setApiKey("");
      toast.success("Clave de Fish Audio guardada y cifrada.");
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteFishKey();

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Clave de Fish Audio eliminada.");
      setConfirmDelete(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2Icon className="size-4" />
          Voz de los guiones (Fish Audio)
        </CardTitle>
        <CardDescription>
          Genera la locución de los guiones con <code className="font-mono">api.fish.audio</code>.
          Consigue tu clave en fish.audio.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="fish-key">Clave de API</Label>
          {summary ? (
            <Badge variant="secondary" className="font-mono text-xs">
              {summary.masked}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              Sin configurar
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            id="fish-key"
            type="password"
            autoComplete="off"
            className="min-w-64 flex-1"
            placeholder="Clave de Fish Audio"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <Button variant="outline" onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            Guardar
          </Button>
          {summary ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Eliminar clave de Fish Audio"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Se guarda cifrada (AES-256-GCM) y solo se usa en el servidor para generar y consultar
          el audio.
        </p>
      </CardContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la clave de Fish Audio?</AlertDialogTitle>
            <AlertDialogDescription>
              No podrás generar voz con Fish Audio hasta que añadas otra clave.
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
