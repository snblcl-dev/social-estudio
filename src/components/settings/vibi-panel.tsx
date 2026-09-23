"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CoinsIcon, Loader2Icon, Trash2Icon, Volume2Icon } from "lucide-react";
import { toast } from "sonner";

import { deleteVibiKey, getVibiAccount, saveVibiKey } from "@/app/actions/vibi";
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

interface VibiPanelProps {
  summary: { masked: string } | null;
}

export function VibiPanel({ summary }: VibiPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSave() {
    if (!apiKey.trim()) {
      toast.error("Pega tu clave de Vibi antes de guardar.");
      return;
    }

    startTransition(async () => {
      const result = await saveVibiKey({ apiKey });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setApiKey("");
      toast.success("Clave de Vibi guardada y cifrada.");
      router.refresh();
    });
  }

  function handleCheckCredits() {
    startTransition(async () => {
      const result = await getVibiAccount();

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        typeof result.credits === "number"
          ? `Créditos disponibles en Vibi: ${result.credits}`
          : "Clave válida.",
      );
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteVibiKey();

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Clave de Vibi eliminada.");
      setConfirmDelete(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2Icon className="size-4" />
          Voz de los guiones (Vibi)
        </CardTitle>
        <CardDescription>
          Genera la locución de los guiones con <code className="font-mono">api.vibi.pro</code>{" "}
          (ElevenLabs, MiniMax y CapCut). Consigue tu clave en vibi.pro.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="vibi-key">Clave de API</Label>
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
            id="vibi-key"
            type="password"
            autoComplete="off"
            className="min-w-64 flex-1"
            placeholder="sk_..."
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <Button variant="outline" onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            Guardar
          </Button>
          {summary ? (
            <>
              <Button variant="outline" onClick={handleCheckCredits} disabled={isPending}>
                <CoinsIcon />
                Ver créditos
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar clave de Vibi"
                onClick={() => setConfirmDelete(true)}
                disabled={isPending}
              >
                <Trash2Icon />
              </Button>
            </>
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
            <AlertDialogTitle>¿Eliminar la clave de Vibi?</AlertDialogTitle>
            <AlertDialogDescription>
              No podrás generar voz para los guiones hasta que añadas otra clave.
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
