"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  FilmIcon,
  Loader2Icon,
  SparklesIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  completeVideoUploads,
  createVideoBatch,
  deleteVideoJob,
  getVideoWallet,
  loadVideoCatalog,
  prepareVideoUploads,
  quoteVideo,
  refreshVideoJobs,
  retryVideoDownload,
} from "@/app/actions/videos";
import { VideoJobCard } from "@/components/videos/video-job-card";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes } from "@/lib/attachments";
import type {
  VideoJob,
  VideoMode,
  VideoPriceRule,
  VideoQuote,
  VideoSettings,
  VideoWalletInfo,
} from "@/lib/types";
import {
  COMMON_ASPECT_RATIOS,
  aspectOptions,
  formatVnd,
  rulesForMode,
  uniqueAudioOptions,
  uniqueDurations,
  uniqueModels,
  uniqueResolutions,
} from "@/lib/video/catalog";
import { VIDEO_PROVIDERS, type VideoProviderId } from "@/lib/video/providers";

const TERMINAL = new Set(["success", "failed", "canceled"]);
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_MOTION_BYTES = 100 * 1024 * 1024;

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

interface VideoStudioProps {
  initialJobs: VideoJob[];
  initialRules: VideoPriceRule[];
  catalogError: string | null;
  maintenance: boolean;
  hasKey: boolean;
  keySource: "user" | "env" | null;
  initialWallet: VideoWalletInfo | null;
  initialWalletError: string | null;
}

interface UploadedKeys {
  images: string[];
  endFrame: string | null;
  motion: string | null;
}

interface SelectedImage {
  file: File;
  url: string;
}

function contentTypeOf(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? "application/octet-stream";
}

function defaultSettings(rules: VideoPriceRule[]): VideoSettings {
  const list = rulesForMode(rules, "image", false);
  const rule = list[0] ?? rules[0];

  if (!rule) {
    return {
      model: "2.6",
      durationSeconds: 5,
      aspectRatio: "9:16",
      resolution: "720p",
      audio: false,
    };
  }

  return {
    model: rule.model,
    durationSeconds: rule.durationSeconds,
    aspectRatio: rule.aspectRatio === "*" ? COMMON_ASPECT_RATIOS[0] : rule.aspectRatio,
    resolution: rule.resolution as VideoSettings["resolution"],
    audio: rule.audio,
  };
}

/** Ajusta una configuración a la primera combinación válida con precio. */
function normalizeSettings(rules: VideoPriceRule[], current: VideoSettings): VideoSettings {
  if (rules.length === 0) return current;

  const availableModels = uniqueModels(rules);
  const model = availableModels.includes(current.model) ? current.model : availableModels[0];
  const byModel = rules.filter((rule) => rule.model === model);

  const availableDurations = uniqueDurations(byModel);
  const durationSeconds = availableDurations.includes(current.durationSeconds)
    ? current.durationSeconds
    : availableDurations[0];
  const byDuration = byModel.filter((rule) => rule.durationSeconds === durationSeconds);

  const availableResolutions = uniqueResolutions(byDuration);
  const resolution = availableResolutions.includes(current.resolution)
    ? current.resolution
    : availableResolutions[0];
  const byResolution = byDuration.filter((rule) => rule.resolution === resolution);

  const availableAudio = uniqueAudioOptions(byResolution);
  const audio = availableAudio.includes(current.audio) ? current.audio : availableAudio[0];
  const byAudio = byResolution.filter((rule) => rule.audio === audio);

  const availableAspects = aspectOptions(byAudio);
  const aspectRatio = availableAspects.includes(current.aspectRatio)
    ? current.aspectRatio
    : (availableAspects[0] ?? COMMON_ASPECT_RATIOS[0]);

  return {
    model,
    durationSeconds,
    resolution: resolution as VideoSettings["resolution"],
    audio,
    aspectRatio,
  };
}

function mergeJobs(current: VideoJob[], incoming: VideoJob[]): VideoJob[] {
  const map = new Map(current.map((job) => [job.id, job]));
  for (const job of incoming) map.set(job.id, job);
  return Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function discountLabel(discount: NonNullable<VideoQuote["discount"]>): string {
  return discount.kind === "percent"
    ? `${(discount.value / 100).toLocaleString("es-ES")}% de descuento`
    : `${formatVnd(discount.value)} de descuento`;
}

export function VideoStudio({
  initialJobs,
  initialRules,
  catalogError,
  maintenance,
  hasKey,
  keySource,
  initialWallet,
  initialWalletError,
}: VideoStudioProps) {
  const [provider, setProvider] = useState<VideoProviderId>("klinggiare");
  const [mode, setMode] = useState<VideoMode>("image");
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [endFrame, setEndFrame] = useState<SelectedImage | null>(null);
  const [motionVideo, setMotionVideo] = useState<File | null>(null);
  const [motionOrientation, setMotionOrientation] = useState<"FULL" | "HALF">("FULL");
  const [keepOriginalSound, setKeepOriginalSound] = useState(true);
  const [rules, setRules] = useState<VideoPriceRule[]>(initialRules);
  const [settings, setSettings] = useState<VideoSettings>(() =>
    defaultSettings(initialRules),
  );
  const [quote, setQuote] = useState<VideoQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>(initialJobs);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingPrice, setPendingPrice] = useState<{
    key: string;
    quote: VideoQuote;
    uploaded: UploadedKeys;
  } | null>(null);
  const [wallet, setWallet] = useState<VideoWalletInfo | null>(initialWallet);
  const [walletError, setWalletError] = useState<string | null>(initialWalletError);
  const [toDelete, setToDelete] = useState<VideoJob | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const submitLock = useRef(false);
  const urlsRef = useRef<string[]>([]);

  const hasEndFrame = mode === "image" && Boolean(endFrame);

  const filteredRules = useMemo(
    () => rulesForMode(rules, mode, hasEndFrame),
    [rules, mode, hasEndFrame],
  );
  const effectiveSettings = useMemo(
    () => normalizeSettings(filteredRules, settings),
    [filteredRules, settings],
  );
  const models = useMemo(() => uniqueModels(filteredRules), [filteredRules]);
  const modelRules = useMemo(
    () => filteredRules.filter((rule) => rule.model === effectiveSettings.model),
    [filteredRules, effectiveSettings.model],
  );
  const durations = useMemo(() => uniqueDurations(modelRules), [modelRules]);
  const durationRules = useMemo(
    () =>
      modelRules.filter(
        (rule) => rule.durationSeconds === effectiveSettings.durationSeconds,
      ),
    [modelRules, effectiveSettings.durationSeconds],
  );
  const resolutions = useMemo(() => uniqueResolutions(durationRules), [durationRules]);
  const resolutionRules = useMemo(
    () =>
      durationRules.filter((rule) => rule.resolution === effectiveSettings.resolution),
    [durationRules, effectiveSettings.resolution],
  );
  const audioOptions = useMemo(() => uniqueAudioOptions(resolutionRules), [resolutionRules]);
  const audioRules = useMemo(
    () => resolutionRules.filter((rule) => rule.audio === effectiveSettings.audio),
    [resolutionRules, effectiveSettings.audio],
  );
  const aspects = useMemo(() => aspectOptions(audioRules), [audioRules]);
  const imageCount = mode === "text" ? 1 : Math.max(images.length, 1);
  const priceVisible = hasKey && filteredRules.length > 0;

  const derivedQuoteError = !hasKey
    ? null
    : filteredRules.length === 0
      ? mode === "image" && endFrame
        ? "Este modelo no admite imagen final con la combinación actual."
        : "No hay precios disponibles para esta combinación."
      : quoteError;

  // Cotización con un pequeño retardo al cambiar la configuración.
  useEffect(() => {
    if (!hasKey || filteredRules.length === 0) return;

    let active = true;

    const timer = setTimeout(() => {
      if (!active) return;
      setQuoteLoading(true);

      quoteVideo({
        provider,
        mode,
        settings: effectiveSettings,
        imageCount,
        hasEndFrame,
      })
        .then((result) => {
          if (!active) return;
          if (result.error || !result.quote) {
            setQuote(null);
            setQuoteError(result.error ?? "No se pudo calcular el precio.");
            return;
          }
          setQuote(result.quote);
          setQuoteError(null);
        })
        .catch(() => {
          if (!active) return;
          setQuote(null);
          setQuoteError("No se pudo calcular el precio.");
        })
        .finally(() => {
          if (active) setQuoteLoading(false);
        });
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    hasKey,
    provider,
    mode,
    effectiveSettings,
    imageCount,
    hasEndFrame,
    filteredRules,
  ]);

  // Mantiene la referencia de las URLs temporales para liberarlas al desmontar.
  useEffect(() => {
    urlsRef.current = [
      ...images.map((item) => item.url),
      ...(endFrame ? [endFrame.url] : []),
    ];
  }, [images, endFrame]);

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const refreshWallet = useCallback(async () => {
    if (!hasKey) return;
    const result = await getVideoWallet(provider);
    if (result.error) {
      setWalletError(result.error);
      return;
    }
    setWallet(result.wallet ?? null);
    setWalletError(null);
  }, [hasKey, provider]);

  // Sondeo de los videos activos.
  const activeKey = jobs
    .filter((job) => !TERMINAL.has(job.status) && job.provider_job_id !== null)
    .map((job) => job.id)
    .join(",");

  useEffect(() => {
    if (!activeKey) return;
    const ids = activeKey.split(",").filter(Boolean);
    let cancelled = false;

    const tick = async () => {
      const result = await refreshVideoJobs(ids);
      if (cancelled || !result.jobs) return;
      setJobs((current) => mergeJobs(current, result.jobs ?? []));
    };

    void tick();
    const interval = setInterval(() => {
      void tick();
    }, 6000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeKey]);

  function revokeSelected(items: SelectedImage[]) {
    items.forEach((item) => URL.revokeObjectURL(item.url));
  }

  function clearInputs() {
    revokeSelected(images);
    if (endFrame) URL.revokeObjectURL(endFrame.url);
    setImages([]);
    setEndFrame(null);
    setMotionVideo(null);
  }

  function updateSettings(patch: Partial<VideoSettings>) {
    setSettings({ ...effectiveSettings, ...patch });
    setPendingPrice(null);
  }

  function changeMode(next: VideoMode) {
    setMode(next);
    setPendingPrice(null);

    if (next === "text") {
      clearInputs();
    }
    if (next === "image") {
      setMotionVideo(null);
    }
    if (next === "motion") {
      if (endFrame) URL.revokeObjectURL(endFrame.url);
      setEndFrame(null);
    }
  }

  function handleImages(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    const invalid = incoming.find((file) => !IMAGE_TYPES.includes(contentTypeOf(file)));
    if (invalid) {
      toast.error("Formato de imagen no admitido.");
      return;
    }
    if (images.length + incoming.length > 100) {
      toast.error("Puedes subir hasta 100 imágenes.");
      return;
    }

    setImages([
      ...images,
      ...incoming.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
    setPendingPrice(null);
    if (mode === "text") setMode("image");
  }

  function removeImage(index: number) {
    const item = images[index];
    if (!item) return;
    URL.revokeObjectURL(item.url);
    setImages((current) => current.filter((_, position) => position !== index));
    setPendingPrice(null);
  }

  function handleEndFrame(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (!IMAGE_TYPES.includes(contentTypeOf(file))) {
      toast.error("Formato de imagen no admitido.");
      return;
    }
    if (endFrame) URL.revokeObjectURL(endFrame.url);
    setEndFrame({ file, url: URL.createObjectURL(file) });
    setPendingPrice(null);
  }

  function clearEndFrame() {
    if (endFrame) URL.revokeObjectURL(endFrame.url);
    setEndFrame(null);
    setPendingPrice(null);
  }

  function handleMotionVideo(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (!VIDEO_TYPES.includes(contentTypeOf(file))) {
      toast.error("Formato de video no admitido (MP4, MOV o WebM).");
      return;
    }
    if (file.size > MAX_MOTION_BYTES) {
      toast.error("El video de muestra supera los 100 MB.");
      return;
    }
    setMotionVideo(file);
    setPendingPrice(null);
  }

  function validateInputs(): string | null {
    if (!hasKey) return "Configura tu clave de Klinggiare en Ajustes.";
    if (maintenance) return "Klinggiare está en mantenimiento.";
    if (!prompt.trim()) return "Escribe un prompt.";
    if (filteredRules.length === 0) return "No hay una combinación de precio válida.";
    if (mode !== "text" && images.length === 0) {
      return mode === "motion"
        ? "Sube al menos una imagen de personaje."
        : "Sube al menos una imagen.";
    }
    if (mode === "motion" && !motionVideo) {
      return "Sube un video de muestra para Motion Control.";
    }
    return null;
  }

  async function uploadInputs(): Promise<{ uploaded?: UploadedKeys; error?: string }> {
    const files: File[] = [];
    const roles: ("image" | "end" | "motion")[] = [];

    if (mode !== "text") {
      images.forEach((item) => {
        files.push(item.file);
        roles.push("image");
      });
    }
    if (mode === "image" && endFrame) {
      files.push(endFrame.file);
      roles.push("end");
    }
    if (mode === "motion" && motionVideo) {
      files.push(motionVideo);
      roles.push("motion");
    }

    if (files.length === 0) {
      return { uploaded: { images: [], endFrame: null, motion: null } };
    }

    const prepared = await prepareVideoUploads({
      provider,
      files: files.map((file) => ({
        filename: file.name,
        contentType: contentTypeOf(file),
        sizeBytes: file.size,
      })),
    });

    if (prepared.error || !prepared.items) {
      return { error: prepared.error ?? "No se pudieron preparar los archivos." };
    }

    const targets = prepared.items;
    const uploadedOk = await Promise.all(
      targets.map(async (target, index) => {
        try {
          const response = await fetch(target.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": target.contentType },
            body: files[index],
          });
          return response.ok;
        } catch {
          return false;
        }
      }),
    );

    if (uploadedOk.some((ok) => !ok)) {
      return { error: "No se pudieron subir los archivos al proveedor." };
    }

    const completed = await completeVideoUploads({
      provider,
      objectKeys: targets.map((target) => target.objectKey),
    });

    if (completed.error) {
      return { error: completed.error };
    }

    const uploaded: UploadedKeys = { images: [], endFrame: null, motion: null };
    targets.forEach((target, index) => {
      const role = roles[index];
      if (role === "image") uploaded.images.push(target.objectKey);
      else if (role === "end") uploaded.endFrame = target.objectKey;
      else uploaded.motion = target.objectKey;
    });

    return { uploaded };
  }

  async function submitBatch(
    uploaded: UploadedKeys,
    idempotencyKey: string,
    expectedTotal?: number,
  ) {
    const result = await createVideoBatch({
      provider,
      mode,
      prompt: prompt.trim(),
      settings: effectiveSettings,
      imageKeys: uploaded.images,
      endFrameKey: uploaded.endFrame,
      motionVideoKey: uploaded.motion,
      motionCharacterOrientation: motionOrientation,
      keepOriginalSound,
      idempotencyKey,
      expectedTotal,
    });

    if (result.priceChanged) {
      setPendingPrice({
        key: idempotencyKey,
        quote: result.priceChanged,
        uploaded,
      });
      toast.error(result.error ?? "El precio cambió.");
      return;
    }

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.jobs) {
      setJobs((current) => mergeJobs(current, result.jobs ?? []));
    }

    setPendingPrice(null);
    clearInputs();
    toast.success(
      result.jobs && result.jobs.length > 1
        ? `${result.jobs.length} videos en cola.`
        : "Video en cola.",
    );
    void refreshWallet();
  }

  async function handleGenerate() {
    if (submitLock.current) return;
    const validation = validateInputs();
    if (validation) {
      toast.error(validation);
      return;
    }

    submitLock.current = true;
    setIsCreating(true);

    try {
      const prepared = await uploadInputs();
      if (prepared.error || !prepared.uploaded) {
        toast.error(prepared.error ?? "No se pudieron subir los archivos.");
        return;
      }

      await submitBatch(prepared.uploaded, crypto.randomUUID());
    } finally {
      submitLock.current = false;
      setIsCreating(false);
    }
  }

  async function handleConfirmPrice() {
    if (!pendingPrice || submitLock.current) return;

    submitLock.current = true;
    setIsCreating(true);

    try {
      await submitBatch(
        pendingPrice.uploaded,
        pendingPrice.key,
        pendingPrice.quote.totalAmount,
      );
    } finally {
      submitLock.current = false;
      setIsCreating(false);
    }
  }

  async function handleReloadCatalog() {
    const result = await loadVideoCatalog(provider);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.rules) setRules(result.rules);
  }

  function handleDelete() {
    if (!toDelete) return;
    const id = toDelete.id;

    setPendingId(id);
    startTransition(async () => {
      const result = await deleteVideoJob(id);
      setPendingId(null);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setJobs((current) => current.filter((job) => job.id !== id));
      setToDelete(null);
      toast.success("Video eliminado.");
    });
  }

  function handleRetryDownload(job: VideoJob) {
    setPendingId(job.id);
    startTransition(async () => {
      const result = await retryVideoDownload(job.id);
      setPendingId(null);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.job) {
        setJobs((current) => mergeJobs(current, [result.job as VideoJob]));
      }
      toast.success("Video descargado.");
    });
  }

  const canGenerate =
    hasKey &&
    !maintenance &&
    prompt.trim().length > 0 &&
    filteredRules.length > 0 &&
    !isCreating &&
    (mode === "text" || images.length > 0) &&
    (mode !== "motion" || Boolean(motionVideo));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FilmIcon className="size-4" />
            Crear video
          </CardTitle>
          <CardDescription>
            Elige el modo, describe el video y ajusta el modelo. El precio se calcula antes de
            generar.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {!hasKey ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-500">
              Configura tu clave de Klinggiare en{" "}
              <Link href="/ajustes" className="underline underline-offset-4">
                Ajustes
              </Link>{" "}
              para generar videos.
            </p>
          ) : null}

          {maintenance ? (
            <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangleIcon className="size-4" />
              Klinggiare está en mantenimiento. Inténtalo más tarde.
            </p>
          ) : null}

          {catalogError ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-500">
              <span className="flex-1">No se pudo cargar el catálogo: {catalogError}</span>
              <Button variant="outline" size="xs" onClick={handleReloadCatalog}>
                Reintentar
              </Button>
            </div>
          ) : null}

          {pendingPrice ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-500">
              <span className="flex-1">
                El precio cambió a {formatVnd(pendingPrice.quote.totalAmount)} para{" "}
                {pendingPrice.quote.imageCount} video(s). Confirma para continuar.
              </span>
              <Button size="xs" onClick={handleConfirmPrice} disabled={isCreating}>
                {isCreating ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                Confirmar
              </Button>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Modo</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={mode === "text" ? "default" : "outline"}
                    size="sm"
                    onClick={() => changeMode("text")}
                  >
                    Texto
                  </Button>
                  <Button
                    variant={mode === "image" ? "default" : "outline"}
                    size="sm"
                    onClick={() => changeMode("image")}
                  >
                    Imagen
                  </Button>
                  <Button
                    variant={mode === "motion" ? "default" : "outline"}
                    size="sm"
                    onClick={() => changeMode("motion")}
                  >
                    Motion Control
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="video-provider">Proveedor</Label>
                <NativeSelect
                  id="video-provider"
                  value={provider}
                  onChange={(event) =>
                    setProvider(event.target.value as VideoProviderId)
                  }
                >
                  {VIDEO_PROVIDERS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </NativeSelect>
                {keySource === "env" ? (
                  <p className="text-xs text-muted-foreground">
                    Clave tomada de la variable de entorno KLING_API_KEY.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="video-prompt">Prompt</Label>
                <Textarea
                  id="video-prompt"
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    setPendingPrice(null);
                  }}
                  placeholder="Describe el video: cámara, movimiento, iluminación, estilo…"
                  className="min-h-24"
                />
              </div>

              {mode !== "text" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="video-images">
                    {mode === "motion" ? "Imágenes del personaje" : "Imágenes"}
                  </Label>
                  <Input
                    id="video-images"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => {
                      handleImages(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  {images.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {images.map((item, index) => (
                        <div key={`${item.file.name}-${index}`} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.url}
                            alt={item.file.name}
                            className="size-16 rounded-md border border-border/60 object-cover"
                          />
                          <button
                            type="button"
                            aria-label={`Quitar ${item.file.name}`}
                            onClick={() => removeImage(index)}
                            className="absolute -top-1.5 -right-1.5 rounded-full border border-border/60 bg-background p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <XIcon className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {mode === "image" ? (
                    <p className="text-xs text-muted-foreground">
                      Cada imagen genera un video. Máximo 100.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {mode === "image" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="video-endframe">Imagen final (opcional)</Label>
                  <Input
                    id="video-endframe"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => {
                      handleEndFrame(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  {endFrame ? (
                    <div className="relative w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={endFrame.url}
                        alt={endFrame.file.name}
                        className="size-16 rounded-md border border-border/60 object-cover"
                      />
                      <button
                        type="button"
                        aria-label="Quitar imagen final"
                        onClick={clearEndFrame}
                        className="absolute -top-1.5 -right-1.5 rounded-full border border-border/60 bg-background p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Con imagen final, el video interpola desde la primera imagen hasta esta.
                  </p>
                </div>
              ) : null}

              {mode === "motion" ? (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="video-motion">Video de muestra (2,5–13 s, máx. 100 MB)</Label>
                    <Input
                      id="video-motion"
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      onChange={(event) => {
                        handleMotionVideo(event.target.files);
                        event.target.value = "";
                      }}
                    />
                    {motionVideo ? (
                      <p className="text-xs text-muted-foreground">
                        {motionVideo.name} · {formatBytes(motionVideo.size)}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="video-orientation">Encuadre</Label>
                      <NativeSelect
                        id="video-orientation"
                        value={motionOrientation}
                        onChange={(event) =>
                          setMotionOrientation(event.target.value as "FULL" | "HALF")
                        }
                      >
                        <option value="FULL">Cuerpo completo</option>
                        <option value="HALF">Medio cuerpo</option>
                      </NativeSelect>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="video-sound">Sonido original</Label>
                      <NativeSelect
                        id="video-sound"
                        value={keepOriginalSound ? "1" : "0"}
                        onChange={(event) => setKeepOriginalSound(event.target.value === "1")}
                      >
                        <option value="1">Conservar</option>
                        <option value="0">Silenciar</option>
                      </NativeSelect>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="video-model">Modelo</Label>
                  <NativeSelect
                    id="video-model"
                    value={effectiveSettings.model}
                    disabled={models.length === 0}
                    onChange={(event) => updateSettings({ model: event.target.value })}
                  >
                    {models.length === 0 ? <option value="">Sin modelos</option> : null}
                    {models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                {mode !== "motion" ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="video-duration">Duración</Label>
                    <NativeSelect
                      id="video-duration"
                      value={String(effectiveSettings.durationSeconds)}
                      disabled={durations.length === 0}
                      onChange={(event) =>
                        updateSettings({ durationSeconds: Number(event.target.value) })
                      }
                    >
                      {durations.map((duration) => (
                        <option key={duration} value={duration}>
                          {duration} s
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2">
                  <Label htmlFor="video-resolution">Resolución</Label>
                  <NativeSelect
                    id="video-resolution"
                    value={effectiveSettings.resolution}
                    disabled={resolutions.length === 0}
                    onChange={(event) =>
                      updateSettings({
                        resolution: event.target.value as VideoSettings["resolution"],
                      })
                    }
                  >
                    {resolutions.map((resolution) => (
                      <option key={resolution} value={resolution}>
                        {resolution}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="video-aspect">Aspecto</Label>
                  <NativeSelect
                    id="video-aspect"
                    value={effectiveSettings.aspectRatio}
                    disabled={aspects.length === 0}
                    onChange={(event) => updateSettings({ aspectRatio: event.target.value })}
                  >
                    {aspects.map((aspect) => (
                      <option key={aspect} value={aspect}>
                        {aspect}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="video-audio">Audio</Label>
                  <NativeSelect
                    id="video-audio"
                    value={effectiveSettings.audio ? "1" : "0"}
                    disabled={audioOptions.length <= 1}
                    onChange={(event) =>
                      updateSettings({ audio: event.target.value === "1" })
                    }
                  >
                    {audioOptions.map((option) => (
                      <option key={String(option)} value={option ? "1" : "0"}>
                        {option ? "Con audio" : "Sin audio"}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Precio estimado</span>
                  {priceVisible && quoteLoading ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : priceVisible && quote ? (
                    <span className="font-heading text-base font-semibold">
                      {formatVnd(quote.totalAmount)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>

                {priceVisible && quote ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {quote.imageCount} video(s) · {formatVnd(quote.perVideoAmount)} c/u
                  </p>
                ) : null}

                {priceVisible && quote?.discount ? (
                  <p className="mt-1 text-xs text-primary">{discountLabel(quote.discount)}</p>
                ) : null}

                {derivedQuoteError ? (
                  <p className="mt-1 text-xs text-destructive">{derivedQuoteError}</p>
                ) : null}
              </div>

              <Button onClick={handleGenerate} disabled={!canGenerate} className="w-full">
                {isCreating ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SparklesIcon />
                )}
                {isCreating ? "Generando…" : "Generar video"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Videos generados</h2>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <WalletIcon className="size-3.5" />
          {!hasKey
            ? "Sin clave configurada"
            : wallet
              ? `Saldo: ${formatVnd(wallet.balance)}${
                  wallet.heldReserve > 0 ? ` · retenido ${formatVnd(wallet.heldReserve)}` : ""
                }`
              : (walletError ?? "Saldo no disponible")}
        </div>
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FilmIcon className="size-5" />
            </span>
            <p className="font-medium">Todavía no has generado ningún video</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Escribe un prompt, sube imágenes o usa Motion Control y pulsa «Generar video».
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <VideoJobCard
              key={job.id}
              job={job}
              isPending={pendingId === job.id}
              onDelete={setToDelete}
              onRetryDownload={handleRetryDownload}
            />
          ))}
        </div>
      )}

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el video?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará de tu galería y se borrará la copia guardada en el servidor. El
              proveedor conserva su propia copia y no permite eliminarla desde la API.
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
