"use client";

import {
  DownloadIcon,
  FilmIcon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { VideoJob } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatVnd } from "@/lib/video/catalog";
import { videoProviderLabel } from "@/lib/video/providers";

const STATUS_LABELS: Record<string, string> = {
  queued: "En cola",
  waiting_credit: "En cola",
  waiting_proxy: "En cola",
  processing: "Generando",
  polling: "Generando",
  review_required: "En revisión",
  success: "Listo",
  failed: "Error",
  canceled: "Cancelado",
};

const TERMINAL = new Set(["success", "failed", "canceled"]);

interface VideoJobCardProps {
  job: VideoJob;
  isPending: boolean;
  onDelete: (job: VideoJob) => void;
  onRetryDownload: (job: VideoJob) => void;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/55">
      {children}
    </span>
  );
}

function statusClass(status: string): string {
  if (status === "success") return "bg-primary text-primary-foreground";
  if (status === "failed") return "bg-red-500/90 text-white";
  if (status === "canceled") return "bg-white/10 text-white/60";
  return "bg-white/10 text-white";
}

export function VideoJobCard({
  job,
  isPending,
  onDelete,
  onRetryDownload,
}: VideoJobCardProps) {
  const isProcessing = !TERMINAL.has(job.status);
  const isFailed = job.status === "failed" || job.status === "canceled";

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101012] transition-colors hover:border-white/20">
      <div className="relative aspect-video w-full overflow-hidden bg-white/[0.03]">
        {job.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.thumbnail_url}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-white/25">
            <FilmIcon className="size-8" />
          </div>
        )}
        <span
          className={cn(
            "absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-medium",
            statusClass(job.status),
          )}
        >
          {STATUS_LABELS[job.status] ?? job.status}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <p className="line-clamp-2 text-sm text-white/80">{job.prompt}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip>{videoProviderLabel(job.provider)}</Chip>
          <Chip>{job.model}</Chip>
          <Chip>{job.resolution}</Chip>
          <Chip>{job.aspect_ratio}</Chip>
          {job.duration_seconds > 0 ? <Chip>{job.duration_seconds}s</Chip> : null}
          {job.has_end_frame ? <Chip>Imagen final</Chip> : null}
          {job.job_type === "motion_control" ? <Chip>Motion Control</Chip> : null}
          {job.price_amount !== null ? <Chip>{formatVnd(job.price_amount)}</Chip> : null}
        </div>

        {isProcessing ? (
          <p className="flex items-center gap-1.5 text-xs text-white/45">
            <Loader2Icon className="size-3.5 animate-spin" />
            {STATUS_LABELS[job.status] ?? "Procesando"}
            {job.eta_ms !== null ? ` · ~${Math.ceil(job.eta_ms / 1000)} s` : "…"}
          </p>
        ) : null}

        {job.error_message ? (
          <p className={cn("text-xs", isFailed ? "text-red-400" : "text-amber-400")}>
            {job.error_message}
          </p>
        ) : null}

        {job.has_video ? (
          <video
            controls
            preload="metadata"
            poster={job.thumbnail_url ?? undefined}
            src={`/api/videos/${job.id}/file`}
            className="w-full rounded-lg bg-black"
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {job.has_video ? (
            <a
              href={`/api/videos/${job.id}/file?download=1`}
              className="inline-flex w-fit items-center gap-1.5 text-xs text-primary underline underline-offset-4"
            >
              <DownloadIcon className="size-3.5" />
              Descargar
            </a>
          ) : null}

          {job.status === "success" && !job.has_video ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetryDownload(job)}
              disabled={isPending}
              className="border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Preparar video
            </Button>
          ) : null}

          {TERMINAL.has(job.status) ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="ml-auto text-white/40 hover:bg-white/10 hover:text-white"
              aria-label="Eliminar video"
              onClick={() => onDelete(job)}
              disabled={isPending}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </div>

        <p className="text-[11px] text-white/30">
          {new Date(job.created_at).toLocaleString("es-ES")}
        </p>
      </div>
    </div>
  );
}
