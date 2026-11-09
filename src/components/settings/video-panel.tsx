"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CoinsIcon, Loader2Icon, Trash2Icon, VideoIcon } from "lucide-react";
import { toast } from "sonner";

import { deleteVideoKey, getVideoWallet, saveVideoKey } from "@/app/actions/videos";
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
import type { VideoKeySummary } from "@/lib/types";
import { formatCredits } from "@/lib/video/catalog";

interface VideoPanelProps {
  provider: string;
  title: string;
  description: React.ReactNode;
  keyPlaceholder: string;
  envVarName: string;
  walletLabel: string;
  walletSupported: boolean;
  summary: VideoKeySummary | null;
}

export function VideoPanel({
  provider,
  title,
  description,
  keyPlaceholder,
  envVarName,
  walletLabel,
  walletSupported,
  summary,
}: VideoPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputId = `${provider}-key`;

  function handleSave() {
    if (!apiKey.trim()) {
      toast.error(`Pega tu clave de ${walletLabel} antes de guardar.`);
      return;
    }

    startTransition(async () => {
      const result = await saveVideoKey({ provider, apiKey });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setApiKey("");
      toast.success(`Clave de ${walletLabel} guardada y cifrada.`);
      router.refresh();
    });
  }

  function handleCheckWallet() {
    startTransition(async () => {
      const result = await getVideoWallet(provider);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.wallet
          ? `Saldo en ${walletLabel}: ${formatCredits(result.wallet.balance)} créditos${
              result.wallet.heldReserve > 0
                ? ` · retenido ${formatCredits(result.wallet.heldReserve)} créditos`
                : ""
            }`
          : "Clave válida.",
      );
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteVideoKey(provider);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`Clave de ${walletLabel} eliminada.`);
      setConfirmDelete(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <VideoIcon className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={inputId}>Clave de API</Label>
          {summary ? (
            <Badge variant="secondary" className="font-mono text-xs">
              {summary.source === "env" ? envVarName : summary.masked}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              Sin configurar
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            id={inputId}
            type="password"
            autoComplete="off"
            className="min-w-64 flex-1"
            placeholder={keyPlaceholder}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <Button variant="outline" onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            Guardar
          </Button>
          {summary && walletSupported ? (
            <Button variant="outline" onClick={handleCheckWallet} disabled={isPending}>
              <CoinsIcon />
              Ver saldo
            </Button>
          ) : null}
          {summary?.source === "user" ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Eliminar clave de ${walletLabel}`}
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Se guarda cifrada (AES-256-GCM) y solo se usa en el servidor. Si guardas una clave aquí,
          tiene prioridad sobre la variable de entorno.
        </p>
      </CardContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la clave de {walletLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              No podrás generar videos hasta que añadas otra clave o configures{" "}
              {envVarName}.
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
