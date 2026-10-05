"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon, UsersIcon, VideoIcon } from "lucide-react";
import { toast } from "sonner";

import {
  createProfile,
  deleteProfile,
  updateProfile,
  type ProfileInput,
} from "@/app/actions/profiles";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import type { Profile, ProfileType } from "@/lib/types";

const EMPTY_FORM: ProfileInput = {
  type: "script",
  name: "",
  description: "",
  script_instructions: "",
  theme_instructions: "",
  image_prompt_instructions: "",
  video_prompt_instructions: "",
};

const COPY: Record<
  ProfileType,
  { title: string; description: string; namePlaceholder: string; emptyTitle: string; emptyText: string }
> = {
  script: {
    title: "Perfiles",
    description:
      "Cada perfil define el estilo de guion, los temas y los prompts de imagen que se usarán en el chat.",
    namePlaceholder: "Ej. Guiones bíblicos",
    emptyTitle: "Todavía no hay perfiles",
    emptyText:
      "Crea el primero para definir, por ejemplo, un estilo bíblico, motivacional o de curiosidades.",
  },
  video: {
    title: "Perfiles de video",
    description:
      "Cada perfil define cómo se generan los prompts de video: estilo, número de escenas, cámara, ritmo…",
    namePlaceholder: "Ej. Video cinematográfico",
    emptyTitle: "Todavía no hay perfiles de video",
    emptyText:
      "Crea el primero para definir el estilo de tus prompts de video (escenas, cámara, iluminación…).",
  },
};

interface ProfilesManagerProps {
  profiles: Profile[];
  type: ProfileType;
}

export function ProfilesManager({ profiles, type }: ProfilesManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState<ProfileInput>(EMPTY_FORM);
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null);

  const copy = COPY[type];

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, type });
    setDialogOpen(true);
  }

  function openEdit(profile: Profile) {
    setEditing(profile);
    setForm({
      type: profile.type,
      name: profile.name,
      description: profile.description ?? "",
      script_instructions: profile.script_instructions,
      theme_instructions: profile.theme_instructions,
      image_prompt_instructions: profile.image_prompt_instructions ?? "",
      video_prompt_instructions: profile.video_prompt_instructions ?? "",
    });
    setDialogOpen(true);
  }

  function handleSave() {
    startTransition(async () => {
      const result = editing
        ? await updateProfile(editing.id, form)
        : await createProfile(form);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(editing ? "Perfil actualizado." : "Perfil creado.");
      setDialogOpen(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!profileToDelete) return;
    const id = profileToDelete.id;

    startTransition(async () => {
      const result = await deleteProfile(id);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Perfil eliminado.");
      setProfileToDelete(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            Nuevo perfil
          </Button>
        }
      />

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {type === "video" ? <VideoIcon className="size-5" /> : <UsersIcon className="size-5" />}
            </span>
            <p className="font-medium">{copy.emptyTitle}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{copy.emptyText}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {profiles.map((profile) => (
            <Card key={profile.id} className="transition-colors hover:ring-primary/30">
              <CardHeader>
                <CardTitle className="font-heading">{profile.name}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {profile.description || "Sin descripción"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {type === "video" ? (
                    <Badge variant="secondary">
                      Prompts de video:{" "}
                      {(profile.video_prompt_instructions ?? "").trim().length} caracteres
                    </Badge>
                  ) : (
                    <>
                      <Badge variant="secondary">
                        Guion: {profile.script_instructions.trim().length} caracteres
                      </Badge>
                      <Badge variant="secondary">
                        Temas: {profile.theme_instructions.trim().length} caracteres
                      </Badge>
                      <Badge variant="secondary">
                        Prompts de imagen:{" "}
                        {(profile.image_prompt_instructions ?? "").trim().length} caracteres
                      </Badge>
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(profile)}>
                    <PencilIcon />
                    Editar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setProfileToDelete(profile)}
                  >
                    <Trash2Icon />
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? "Editar perfil"
                : type === "video"
                  ? "Nuevo perfil de video"
                  : "Nuevo perfil"}
            </DialogTitle>
            <DialogDescription>
              Pega aquí las instrucciones completas. Se enviarán al modelo en cada mensaje.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-name">Nombre</Label>
              <Input
                id="profile-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder={copy.namePlaceholder}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-description">Descripción (opcional)</Label>
              <Input
                id="profile-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Para qué sirve este perfil"
              />
            </div>

            {type === "video" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="profile-video-prompts">
                  Instrucciones de prompts de video
                </Label>
                <Textarea
                  id="profile-video-prompts"
                  value={form.video_prompt_instructions}
                  onChange={(event) =>
                    setForm({ ...form, video_prompt_instructions: event.target.value })
                  }
                  rows={12}
                  placeholder="Ej. Genera un prompt por escena, estilo cinematográfico realista, movimientos de cámara suaves, luz natural, duración de 5-8 segundos, sin texto en pantalla…"
                />
                <p className="text-xs text-muted-foreground">
                  Aquí defines el estilo, número de escenas, cámara, ritmo, etc. Se usan al pulsar
                  «Prompts de video» en el chat.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="profile-script">
                    Instrucciones de estilo y formato del guion
                  </Label>
                  <Textarea
                    id="profile-script"
                    value={form.script_instructions}
                    onChange={(event) =>
                      setForm({ ...form, script_instructions: event.target.value })
                    }
                    rows={10}
                    placeholder="Ej. Escribe en tono bíblico, comienza con una pregunta retórica, usa lenguaje solemne, cierra con una reflexión…"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="profile-themes">Instrucciones de temas</Label>
                  <Textarea
                    id="profile-themes"
                    value={form.theme_instructions}
                    onChange={(event) =>
                      setForm({ ...form, theme_instructions: event.target.value })
                    }
                    rows={8}
                    placeholder="Ej. Los temas deben ser historias del Antiguo Testamento poco conocidas, con una aplicación práctica para hoy…"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="profile-image-prompts">
                    Instrucciones de prompts de imagen
                  </Label>
                  <Textarea
                    id="profile-image-prompts"
                    value={form.image_prompt_instructions}
                    onChange={(event) =>
                      setForm({ ...form, image_prompt_instructions: event.target.value })
                    }
                    rows={8}
                    placeholder="Ej. Genera 12 escenas por guion. Estilo cinematográfico realista, luz cálida, planos medios, sin texto en la imagen…"
                  />
                  <p className="text-xs text-muted-foreground">
                    Aquí puedes indicar cuántas escenas quieres y el estilo visual. Se usan al pulsar
                    «Prompts de imagen» en el chat.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isPending || form.name.trim().length === 0}>
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              {editing ? "Guardar cambios" : "Crear perfil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={profileToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setProfileToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el perfil?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{profileToDelete?.name}». Los guiones ya guardados no se borran.
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
    </div>
  );
}
