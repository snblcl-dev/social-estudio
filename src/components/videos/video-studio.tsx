"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  FilmIcon,
  ImagePlusIcon,
  Loader2Icon,
  PlayIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  VideoIcon,
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
import { cn } from "@/lib/utils";
import {
  COMMON_ASPECT_RATIOS,
  aspectOptions,
  formatCredits,
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

const MODE_TABS: { id: VideoMode; label: string }[] = [
  { id: "text", label: "Texto" },
  { id: "image", label: "Imagen" },
  { id: "motion", label: "Motion Control" },
];

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
    : `${formatCredits(discount.value)} créditos de descuento`;
}

function FieldSelect({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 transition-colors focus-within:border-primary/50">
      <span className="block text-[10px] font-medium tracking-[0.14em] text-white/35 uppercase">
        {label}
      </span>
      <div className="relative mt-0.5">
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="w-full appearance-none bg-transparent pr-5 text-sm font-medium text-white outline-none disabled:opacity-50 [&>option]:bg-popover [&>option]:text-popover-foreground"
        >
          {children}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-0 size-4 -translate-y-1/2 text-white/35" />
      </div>
    </div>
  );
}

function StepCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div
        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-primary/[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(80% 80% at 50% 0%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 70%)",
        }}
      >
        <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:28px_28px]" />
        <span className="relative flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-primary">
          {icon}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-white/10 p-4">
        <h3 className="text-sm font-semibold tracking-wide text-white uppercase">{title}</h3>
        <p className="text-xs leading-relaxed text-white/45">{description}</p>
      </div>
    </div>
  );
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
  const [rightTab, setRightTab] = useState<"history" | "how">("history");
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
    setRightTab("history");
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

  const generateLabel = isCreating
    ? "Generando…"
    : quote
      ? `Generar · ${formatCredits(quote.totalAmount)} créditos`
      : "Generar video";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* Riel de controles */}
      <aside className="flex max-h-[78dvh] min-h-0 flex-col border-b border-white/10 bg-[#0a0a0b] lg:max-h-none lg:border-r lg:border-b-0">
        <nav className="flex shrink-0 items-center gap-5 overflow-x-auto border-b border-white/10 px-5">
          {MODE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => changeMode(tab.id)}
              className={cn(
                "relative shrink-0 pt-4 pb-3 text-sm font-medium whitespace-nowrap transition-colors",
                mode === tab.id ? "text-white" : "text-white/40 hover:text-white/75",
              )}
            >
              {tab.label}
              {mode === tab.id ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
              ) : null}
            </button>
          ))}
        </nav>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          {!hasKey ? (
            <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
              Configura tu clave de Klinggiare en{" "}
              <Link href="/ajustes" className="underline underline-offset-4">
                Ajustes
              </Link>{" "}
              para generar videos.
            </p>
          ) : null}

          {maintenance ? (
            <p className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertTriangleIcon className="size-3.5 shrink-0" />
              Klinggiare está en mantenimiento.
            </p>
          ) : null}

          {catalogError ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
              <span className="flex-1">No se pudo cargar el catálogo.</span>
              <button
                type="button"
                onClick={handleReloadCatalog}
                className="rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {pendingPrice ? (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
              <span>
                El precio cambió a {formatCredits(pendingPrice.quote.totalAmount)}{" "}
                créditos para{" "}
                {pendingPrice.quote.imageCount} video(s).
              </span>
              <Button
                size="sm"
                onClick={handleConfirmPrice}
                disabled={isCreating}
                className="w-full"
              >
                {isCreating ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                Confirmar y generar
              </Button>
            </div>
          ) : null}

          {/* Referencias */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-medium tracking-[0.14em] text-white/35 uppercase">
              Referencias
            </span>

            {mode === "text" ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/35">
                El modo texto no necesita referencias.
              </p>
            ) : (
              <>
                {images.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {images.map((item, index) => (
                      <div key={`${item.file.name}-${index}`} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.url}
                          alt={item.file.name}
                          className="size-14 rounded-lg border border-white/10 object-cover"
                        />
                        <button
                          type="button"
                          aria-label={`Quitar ${item.file.name}`}
                          onClick={() => removeImage(index)}
                          className="absolute -top-1.5 -right-1.5 rounded-full border border-white/15 bg-[#141416] p-0.5 text-white/60 hover:text-white"
                        >
                          <XIcon className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <label className="group flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-3 py-5 text-center transition-colors hover:border-primary/40 hover:bg-white/[0.04]">
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => {
                      handleImages(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <ImagePlusIcon className="size-5 text-white/35 group-hover:text-primary" />
                  <span className="text-sm font-medium text-white/80">
                    {mode === "motion" ? "Añadir personaje" : "Añadir imágenes"}
                  </span>
                  <span className="text-[11px] text-white/35">
                    {mode === "motion"
                      ? "Imagen del personaje · JPEG, PNG, WebP o GIF"
                      : "Una imagen = un video · máx. 100"}
                  </span>
                </label>

                {mode === "image" ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-white/50">
                        {endFrame ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={endFrame.url}
                            alt={endFrame.file.name}
                            className="size-8 rounded-lg object-cover"
                          />
                        ) : (
                          <FilmIcon className="size-4" />
                        )}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-xs font-medium text-white/80">
                          Imagen final
                        </span>
                        <span className="truncate text-[11px] text-white/35">
                          {endFrame ? endFrame.file.name : "Opcional · primer y último frame"}
                        </span>
                      </div>
                      {endFrame ? (
                        <button
                          type="button"
                          aria-label="Quitar imagen final"
                          onClick={clearEndFrame}
                          className="rounded-md p-1 text-white/45 hover:bg-white/10 hover:text-white"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      ) : (
                        <label className="cursor-pointer rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10">
                          Subir
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            onChange={(event) => {
                              handleEndFrame(event.target.files);
                              event.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ) : null}

                {mode === "motion" ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-white/50">
                        <VideoIcon className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-xs font-medium text-white/80">
                          Video de referencia
                        </span>
                        <span className="truncate text-[11px] text-white/35">
                          {motionVideo
                            ? `${motionVideo.name} · ${formatBytes(motionVideo.size)}`
                            : "2,5–13 s · máx. 100 MB"}
                        </span>
                      </div>
                      <label className="cursor-pointer rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10">
                        {motionVideo ? "Cambiar" : "Subir"}
                        <input
                          type="file"
                          accept="video/mp4,video/quicktime,video/webm"
                          className="hidden"
                          onChange={(event) => {
                            handleMotionVideo(event.target.files);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Prompt */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-medium tracking-[0.14em] text-white/35 uppercase">
              Prompt
            </span>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors focus-within:border-primary/40">
              <Textarea
                id="video-prompt"
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  setPendingPrice(null);
                }}
                placeholder="Describe el cambio visual que quieres: cámara, luz, acción, estilo…"
                className="min-h-24 resize-none border-0 bg-transparent p-0 text-sm shadow-none placeholder:text-white/25 focus-visible:ring-0"
              />
              <div className="mt-2 flex items-center justify-between text-[11px] text-white/30">
                <span>Sin límite práctico · sé específico</span>
                <span>{prompt.length}</span>
              </div>
            </div>
          </div>

          {/* Ajustes */}
          <div className="flex flex-col gap-3">
            <FieldSelect
              label="Proveedor"
              value={provider}
              onChange={(event) => setProvider(event.target.value as VideoProviderId)}
            >
              {VIDEO_PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </FieldSelect>

            <FieldSelect
              label="Modelo"
              value={effectiveSettings.model}
              onChange={(event) => updateSettings({ model: event.target.value })}
              disabled={models.length === 0}
            >
              {models.length === 0 ? <option value="">Sin modelos</option> : null}
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </FieldSelect>

            <div className="grid grid-cols-2 gap-3">
              {mode !== "motion" ? (
                <FieldSelect
                  label="Duración"
                  value={String(effectiveSettings.durationSeconds)}
                  onChange={(event) =>
                    updateSettings({ durationSeconds: Number(event.target.value) })
                  }
                  disabled={durations.length === 0}
                >
                  {durations.map((duration) => (
                    <option key={duration} value={duration}>
                      {duration} s
                    </option>
                  ))}
                </FieldSelect>
              ) : null}

              <FieldSelect
                label="Aspecto"
                value={effectiveSettings.aspectRatio}
                onChange={(event) => updateSettings({ aspectRatio: event.target.value })}
                disabled={aspects.length === 0}
              >
                {aspects.map((aspect) => (
                  <option key={aspect} value={aspect}>
                    {aspect}
                  </option>
                ))}
              </FieldSelect>

              <FieldSelect
                label="Resolución"
                value={effectiveSettings.resolution}
                onChange={(event) =>
                  updateSettings({
                    resolution: event.target.value as VideoSettings["resolution"],
                  })
                }
                disabled={resolutions.length === 0}
              >
                {resolutions.map((resolution) => (
                  <option key={resolution} value={resolution}>
                    {resolution}
                  </option>
                ))}
              </FieldSelect>

              {mode === "motion" ? (
                <>
                  <FieldSelect
                    label="Encuadre"
                    value={motionOrientation}
                    onChange={(event) =>
                      setMotionOrientation(event.target.value as "FULL" | "HALF")
                    }
                  >
                    <option value="FULL">Cuerpo completo</option>
                    <option value="HALF">Medio cuerpo</option>
                  </FieldSelect>

                  <FieldSelect
                    label="Sonido original"
                    value={keepOriginalSound ? "1" : "0"}
                    onChange={(event) => setKeepOriginalSound(event.target.value === "1")}
                  >
                    <option value="1">Conservar</option>
                    <option value="0">Silenciar</option>
                  </FieldSelect>
                </>
              ) : (
                <FieldSelect
                  label="Audio"
                  value={effectiveSettings.audio ? "1" : "0"}
                  onChange={(event) => updateSettings({ audio: event.target.value === "1" })}
                  disabled={audioOptions.length <= 1}
                >
                  {audioOptions.map((option) => (
                    <option key={String(option)} value={option ? "1" : "0"}>
                      {option ? "Con audio" : "Sin audio"}
                    </option>
                  ))}
                </FieldSelect>
              )}
            </div>

            {keySource === "env" ? (
              <p className="text-[11px] text-white/30">
                Clave tomada de la variable de entorno KLING_API_KEY.
              </p>
            ) : null}
          </div>
        </div>

        {/* Precio y acción */}
        <div className="shrink-0 border-t border-white/10 bg-[#0a0a0b] p-4">
          <div className="mb-3 flex items-start justify-between gap-2 text-xs">
            <span className="text-white/40">Precio estimado</span>
            <div className="flex flex-col items-end">
              {priceVisible && quoteLoading ? (
                <Loader2Icon className="size-4 animate-spin text-white/50" />
              ) : priceVisible && quote ? (
                <span className="text-sm font-semibold text-white">
                  {formatCredits(quote.totalAmount)} créditos
                </span>
              ) : (
                <span className="text-white/30">—</span>
              )}
              {priceVisible && quote ? (
                <span className="text-[11px] text-white/35">
                  {quote.imageCount} video(s) · {formatCredits(quote.perVideoAmount)} c/u
                </span>
              ) : null}
            </div>
          </div>

          {priceVisible && quote?.discount ? (
            <p className="mb-2 text-[11px] text-primary">{discountLabel(quote.discount)}</p>
          ) : null}

          {derivedQuoteError ? (
            <p className="mb-2 text-[11px] text-red-400">{derivedQuoteError}</p>
          ) : null}

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="h-11 w-full rounded-xl text-sm font-semibold disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
          >
            {isCreating ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {generateLabel}
          </Button>
        </div>
      </aside>

      {/* Lienzo */}
      <section className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => setRightTab("history")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                rightTab === "history"
                  ? "bg-white/10 text-white"
                  : "text-white/45 hover:text-white/80",
              )}
            >
              Historial
            </button>
            <button
              type="button"
              onClick={() => setRightTab("how")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                rightTab === "how"
                  ? "bg-white/10 text-white"
                  : "text-white/45 hover:text-white/80",
              )}
            >
              Cómo funciona
            </button>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/50">
            <WalletIcon className="size-3.5" />
            {!hasKey
              ? "Sin clave"
              : wallet
                ? `Saldo ${formatCredits(wallet.balance)} créditos${
                    wallet.heldReserve > 0
                      ? ` · retenido ${formatCredits(wallet.heldReserve)} créditos`
                      : ""
                  }`
                : (walletError ?? "Saldo no disponible")}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rightTab === "how" || jobs.length === 0 ? (
            <div className="flex flex-col gap-8 px-6 py-10 sm:px-10">
              <div className="max-w-3xl">
                <h1 className="font-heading text-3xl font-bold tracking-tight text-white uppercase sm:text-5xl">
                  {jobs.length === 0 && rightTab === "history"
                    ? "Genera videos en un clic"
                    : "Cómo funciona"}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">
                  Elige un modo, añade referencias, ajusta el modelo y genera. Cada imagen
                  produce un video; el precio se calcula antes de empezar.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <StepCard
                  icon={<ImagePlusIcon className="size-6" />}
                  title="1 · Añade referencias"
                  description="Sube una o varias imágenes para imagen a video, o un video de muestra para Motion Control. En texto puedes empezar sin archivos."
                />
                <StepCard
                  icon={<SlidersHorizontalIcon className="size-6" />}
                  title="2 · Ajusta la generación"
                  description="Elige modelo, duración, aspecto, resolución y audio. Verás el precio estimado actualizarse en el riel izquierdo."
                />
                <StepCard
                  icon={<PlayIcon className="size-6" />}
                  title="3 · Genera y descarga"
                  description="El video se procesa en el proveedor y aparece en el historial. Se guarda en tu servidor para reproducirlo y descargarlo cuando quieras."
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
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
        </div>
      </section>

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
