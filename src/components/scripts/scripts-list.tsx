"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CopyIcon,
  EyeIcon,
  FileTextIcon,
  Loader2Icon,
  MicIcon,
  PencilIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { deleteScript, updateScript } from "@/app/actions/scripts";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VoiceoverDialog } from "@/components/scripts/voiceover-dialog";
import type { Profile, Script } from "@/lib/types";

interface ScriptsListProps {
  scripts: Script[];
  profiles: Profile[];
  hasVibiKey: boolean;
}

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
  } catch {
    toast.error("No se pudo copiar al portapapeles.");
  }
}

export function ScriptsList({ scripts, profiles, hasVibiKey }: ScriptsListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openScript, setOpenScript] = useState<Script | null>(null);
  const [voiceoverScript, setVoiceoverScript] = useState<Script | null>(null);
  const [scriptToDelete, setScriptToDelete] = useState<Script | null>(null);
  const [editScript, setEditScript] = useState<Script | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.name]));

  function startEdit(script: Script) {
    setEditScript(script);
    setEditTitle(script.title);
    setEditContent(script.content);
  }

  function handleEditSave() {
    if (!editScript) return;

    startTransition(async () => {
      const result = await updateScript({
        id: editScript.id,
        title: editTitle,
        content: editContent,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Guion actualizado.");
      setEditScript(null);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!scriptToDelete) return;
    const id = scriptToDelete.id;

    startTransition(async () => {
      const result = await deleteScript(id);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Guion eliminado.");
      setScriptToDelete(null);
      router.refresh();
    });
  }

  if (scripts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileTextIcon className="size-5" />
          </span>
          <p className="font-medium">Todavía no has guardado ningún guion</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Genera uno en el chat y pulsa «Guardar en Guiones».
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {scripts.map((script) => (
        <Card key={script.id} className="transition-colors hover:ring-primary/30">
          <CardHeader>
            <CardTitle className="line-clamp-1 font-heading">{script.title}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span>
                {new Date(script.created_at).toLocaleDateString("es-ES", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              {script.profile_id && profileNames.get(script.profile_id) ? (
                <Badge variant="secondary">{profileNames.get(script.profile_id)}</Badge>
              ) : null}
              {script.image_prompts.length > 0 ? (
                <Badge variant="outline">{script.image_prompts.length} prompts</Badge>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="line-clamp-4 text-sm whitespace-pre-wrap text-muted-foreground">
              {script.content}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpenScript(script)}>
                <EyeIcon />
                Ver
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(script.content, "Guion")}
              >
                <CopyIcon />
                Copiar guion
              </Button>
              {script.image_prompts.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    copyToClipboard(
                      script.image_prompts.map((item) => item.prompt).join("\n\n"),
                      "Prompts",
                    )
                  }
                >
                  <CopyIcon />
                  Copiar prompts
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => startEdit(script)}>
                <PencilIcon />
                Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVoiceoverScript(script)}
              >
                <MicIcon />
                Generar voz
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="ml-auto"
                onClick={() => setScriptToDelete(script)}
              >
                <Trash2Icon />
                Eliminar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog
        open={openScript !== null}
        onOpenChange={(open) => {
          if (!open) setOpenScript(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="line-clamp-2">{openScript?.title}</DialogTitle>
          </DialogHeader>

          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium">Guion</h3>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => copyToClipboard(openScript?.content ?? "", "Guion")}
                >
                  <CopyIcon />
                  Copiar
                </Button>
              </div>
              <p className="rounded-lg border border-border/60 bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                {openScript?.content}
              </p>
            </div>

            {openScript && openScript.image_prompts.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-medium">Prompts de imagen</h3>
                <div className="flex flex-col gap-2">
                  {openScript.image_prompts.map((item) => (
                    <div key={item.index} className="rounded-lg border border-border/60 bg-muted/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">
                          {item.index}. {item.scene}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => copyToClipboard(item.prompt, `Prompt ${item.index}`)}
                          aria-label={`Copiar prompt ${item.index}`}
                        >
                          <CopyIcon />
                        </Button>
                      </div>
                      <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">
                        {item.prompt}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editScript !== null}
        onOpenChange={(open) => {
          if (!open) setEditScript(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar guion</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-script-title">Título</Label>
              <Input
                id="edit-script-title"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-script-content">Guion</Label>
              <Textarea
                id="edit-script-content"
                value={editContent}
                className="max-h-[55vh] min-h-64 overflow-y-auto font-mono"
                onChange={(event) => setEditContent(event.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditScript(null)} disabled={isPending}>
                Cancelar
              </Button>
              <Button onClick={handleEditSave} disabled={isPending}>
                {isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <VoiceoverDialog
        script={voiceoverScript}
        open={voiceoverScript !== null}
        onOpenChange={(open) => {
          if (!open) setVoiceoverScript(null);
        }}
        hasVibiKey={hasVibiKey}
      />

      <AlertDialog
        open={scriptToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setScriptToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el guion?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{scriptToDelete?.title}» junto con sus prompts de imagen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
