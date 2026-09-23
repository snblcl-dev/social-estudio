"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { DownloadIcon, Loader2Icon, MicIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  deleteVoiceover,
  listVoiceovers,
  refreshVoiceover,
  startVoiceover,
} from "@/app/actions/vibi";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import type {
  Script,
  VibiLanguage,
  VibiModel,
  VibiProvider,
  VibiVoice,
  Voiceover,
} from "@/lib/types";

const VIBI_PROVIDERS: { id: VibiProvider; label: string }[] = [
  { id: "elevenlabs", label: "ElevenLabs" },
  { id: "minimax", label: "MiniMax" },
  { id: "capcut", label: "CapCut" },
];

const DEFAULT_LANGUAGE: Record<VibiProvider, string> = {
  elevenlabs: "es",
  minimax: "Spanish",
  capcut: "es",
};

const DEFAULT_MODEL: Record<VibiProvider, string> = {
  elevenlabs: "eleven_multilingual_v2",
  minimax: "speech-2.8-turbo",
  capcut: "",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "En cola",
  processing: "Generando",
  completed: "Listo",
  failed: "Error",
};

interface VoiceoverDialogProps {
  script: Script | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasVibiKey: boolean;
}

export function VoiceoverDialog({
  script,
  open,
  onOpenChange,
  hasVibiKey,
}: VoiceoverDialogProps) {
  const [provider, setProvider] = useState<VibiProvider>("elevenlabs");
  const [voices, setVoices] = useState<VibiVoice[]>([]);
  const [languages, setLanguages] = useState<VibiLanguage[]>([]);
  const [models, setModels] = useState<VibiModel[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [languageCode, setLanguageCode] = useState(DEFAULT_LANGUAGE.elevenlabs);
  const [modelId, setModelId] = useState(DEFAULT_MODEL.elevenlabs);
  const [speed, setSpeed] = useState(1);
  const [voiceSearch, setVoiceSearch] = useState("");
  const [catalogProvider, setCatalogProvider] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [voiceovers, setVoiceovers] = useState<Voiceover[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Voiceover | null>(null);
  const [, startTransition] = useTransition();

  const filteredVoices = useMemo(() => {
    const term = voiceSearch.trim().toLowerCase();
    if (!term) return voices;
    return voices.filter((voice) => voice.name.toLowerCase().includes(term));
  }, [voices, voiceSearch]);

  // Carga los audios ya generados del guion.
  useEffect(() => {
    if (!open || !script) return;
    let active = true;

    listVoiceovers(script.id).then((items) => {
      if (active) setVoiceovers(items);
    });

    return () => {
      active = false;
    };
  }, [open, script]);

  const loadingCatalog = catalogProvider !== provider;

  function handleProviderChange(next: VibiProvider) {
    setProvider(next);
    setVoiceId("");
    setVoiceSearch("");
    setLanguageCode(DEFAULT_LANGUAGE[next]);
    setModelId(DEFAULT_MODEL[next]);
  }

  // Carga voces, idiomas y modelos del proveedor.
  useEffect(() => {
    if (!open || !script || !hasVibiKey) return;
    let active = true;

    const base = `/api/vibi/catalog?provider=${provider}`;

    Promise.all([
      fetch(`${base}&kind=voices`).then((response) => response.json()),
      fetch(`${base}&kind=languages`).then((response) => response.json()),
      fetch(`${base}&kind=models`).then((response) => response.json()),
    ])
      .then(([voicesData, languagesData, modelsData]) => {
        if (!active) return;

        const nextVoices: VibiVoice[] = voicesData.items ?? [];
        setVoices(nextVoices);
        setLanguages(languagesData.items ?? []);
        setModels(modelsData.items ?? []);
        setVoiceId((current) => current || nextVoices[0]?.voice_id || "");
        setCatalogProvider(provider);
      })
      .catch(() => {
        if (active) toast.error("No se pudieron cargar las voces de Vibi.");
      });

    return () => {
      active = false;
    };
  }, [open, script, provider, hasVibiKey]);

  // Sondea el estado de la tarea activa.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;

    const interval = setInterval(async () => {
      const result = await refreshVoiceover(activeId);
      if (cancelled) return;

      if (result.voiceover) {
        const updated = result.voiceover;
        setVoiceovers((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );

        if (updated.status === "completed" || updated.status === "failed") {
          setActiveId(null);
          if (updated.status === "completed") {
            toast.success("Voz generada.");
          } else {
            toast.error(updated.error || "La generación de voz falló.");
          }
        }
      } else if (result.error) {
        setActiveId(null);
        toast.error(result.error);
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeId]);

  async function handleGenerate() {
    if (!script) return;

    if (!voiceId) {
      toast.error("Elige una voz.");
      return;
    }

    setIsGenerating(true);
    try {
      const result = await startVoiceover({
        scriptId: script.id,
        provider,
        voiceId,
        modelId: modelId || undefined,
        languageCode,
        speed,
      });

      if (result.error || !result.voiceover) {
        toast.error(result.error ?? "No se pudo iniciar la generación.");
        return;
      }

      const created = result.voiceover;
      setVoiceovers((current) => [created, ...current]);
      setActiveId(created.id);
      toast.success("Generando voz…");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleDelete() {
    if (!toDelete) return;
    const id = toDelete.id;

    startTransition(async () => {
      const result = await deleteVoiceover(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      setVoiceovers((current) => current.filter((item) => item.id !== id));
      setToDelete(null);
      toast.success("Audio eliminado.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MicIcon className="size-4" />
            Generar voz
          </DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[75vh] flex-col gap-5 overflow-y-auto pr-1">
          {!hasVibiKey ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-500">
              Configura tu clave de Vibi en Ajustes para generar la voz de los guiones.
            </p>
          ) : (
            <div className="flex flex-col gap-4 rounded-lg border border-border/60 bg-muted/30 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="voiceover-provider">Proveedor</Label>
                  <NativeSelect
                    id="voiceover-provider"
                    value={provider}
                    onChange={(event) =>
                      handleProviderChange(event.target.value as VibiProvider)
                    }
                  >
                    {VIBI_PROVIDERS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="voiceover-language">Idioma</Label>
                  {languages.length > 0 ? (
                    <NativeSelect
                      id="voiceover-language"
                      value={languageCode}
                      onChange={(event) => setLanguageCode(event.target.value)}
                    >
                      {languages.map((language) => (
                        <option key={language.code} value={language.code}>
                          {language.name}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      id="voiceover-language"
                      value={languageCode}
                      onChange={(event) => setLanguageCode(event.target.value)}
                    />
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="voiceover-voice-search">Voz</Label>
                  <Input
                    id="voiceover-voice-search"
                    value={voiceSearch}
                    placeholder="Buscar voz…"
                    onChange={(event) => setVoiceSearch(event.target.value)}
                  />
                  <NativeSelect
                    aria-label="Voz"
                    value={voiceId}
                    onChange={(event) => setVoiceId(event.target.value)}
                  >
                    {filteredVoices.length === 0 ? (
                      <option value="">
                        {loadingCatalog ? "Cargando voces…" : "Sin voces disponibles"}
                      </option>
                    ) : null}
                    {filteredVoices.map((voice) => (
                      <option key={voice.voice_id} value={voice.voice_id}>
                        {voice.name}
                        {voice.gender ? ` · ${voice.gender}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                {provider !== "capcut" ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="voiceover-model">Modelo</Label>
                    {models.length > 0 ? (
                      <NativeSelect
                        id="voiceover-model"
                        value={modelId}
                        onChange={(event) => setModelId(event.target.value)}
                      >
                        {models.map((model) => (
                          <option key={model.model_id} value={model.model_id}>
                            {model.name}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : (
                      <Input
                        id="voiceover-model"
                        value={modelId}
                        onChange={(event) => setModelId(event.target.value)}
                      />
                    )}
                  </div>
                ) : null}

                <div className="flex flex-col gap-2">
                  <Label htmlFor="voiceover-speed">Velocidad</Label>
                  <Input
                    id="voiceover-speed"
                    type="number"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value) || 1)}
                  />
                </div>
              </div>

              <div>
                <Button onClick={handleGenerate} disabled={isGenerating || loadingCatalog}>
                  {isGenerating ? <Loader2Icon className="animate-spin" /> : <MicIcon />}
                  Generar voz
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Audios generados</h3>

            {voiceovers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay audios para este guion.
              </p>
            ) : (
              voiceovers.map((voiceover) => (
                <div
                  key={voiceover.id}
                  className="flex flex-col gap-3 rounded-lg border border-border/60 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      variant={voiceover.status === "failed" ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {STATUS_LABEL[voiceover.status] ?? voiceover.status}
                    </Badge>
                    <span className="text-muted-foreground">
                      {VIBI_PROVIDERS.find((item) => item.id === voiceover.provider)?.label ??
                        voiceover.provider}{" "}
                      · {voiceover.voice_id}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(voiceover.created_at).toLocaleString("es-ES")}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="ml-auto"
                      aria-label="Eliminar audio"
                      onClick={() => setToDelete(voiceover)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>

                  {voiceover.status === "generating" ||
                  voiceover.status === "processing" ||
                  voiceover.status === "pending" ? (
                    <p className="text-xs text-muted-foreground">
                      Progreso: {voiceover.progress}%
                    </p>
                  ) : null}

                  {voiceover.status === "failed" ? (
                    <p className="text-xs text-destructive">
                      {voiceover.error || "La generación falló."}
                    </p>
                  ) : null}

                  {voiceover.audio_url ? (
                    <div className="flex flex-col gap-2">
                      <audio controls src={voiceover.audio_url} className="w-full" />
                      <a
                        href={voiceover.audio_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-fit items-center gap-1.5 text-xs text-primary underline underline-offset-4"
                      >
                        <DownloadIcon className="size-3.5" />
                        Descargar audio
                      </a>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el audio?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará este audio generado. La tarea seguirá existiendo en Vibi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
