"use client";

import {
  DownloadIcon,
  FilmIcon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { VideoJob } from "@/lib/types";
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

export function VideoJobCard({
  job,
  isPending,
  onDelete,
  onRetryDownload,
}: VideoJobCardProps) {
  const isProcessing = !TERMINAL.has(job.status);
  const isFailed = job.status === "failed" || job.status === "canceled";

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {job.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.thumbnail_url}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <FilmIcon className="size-8" />
          </div>
        )}
        <Badge
          variant={job.status === "failed" ? "destructive" : "secondary"}
          className="absolute top-2 left-2 text-xs"
        >
          {STATUS_LABELS[job.status] ?? job.status}
        </Badge>
      </div>

      <CardContent className="flex flex-col gap-3 p-4">
        <p className="line-clamp-2 text-sm">{job.prompt}</p>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline">{videoProviderLabel(job.provider)}</Badge>
          <Badge variant="outline">{job.model}</Badge>
          <Badge variant="outline">{job.resolution}</Badge>
          <Badge variant="outline">{job.aspect_ratio}</Badge>
          {job.duration_seconds > 0 ? (
            <Badge variant="outline">{job.duration_seconds}s</Badge>
          ) : null}
          {job.has_end_frame ? <Badge variant="outline">Imagen final</Badge> : null}
          {job.job_type === "motion_control" ? (
            <Badge variant="outline">Motion Control</Badge>
          ) : null}
          {job.price_amount !== null ? (
            <Badge variant="outline">{formatVnd(job.price_amount)}</Badge>
          ) : null}
        </div>

        {isProcessing ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            {STATUS_LABELS[job.status] ?? "Procesando"}
            {job.eta_ms !== null ? ` · ~${Math.ceil(job.eta_ms / 1000)} s` : "…"}
          </p>
        ) : null}

        {job.error_message ? (
          <p className={isFailed ? "text-xs text-destructive" : "text-xs text-amber-500"}>
            {job.error_message}
          </p>
        ) : null}

        {job.has_video ? (
          <video
            controls
            preload="metadata"
            poster={job.thumbnail_url ?? undefined}
            src={`/api/videos/${job.id}/file`}
            className="w-full rounded-md bg-black"
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
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Preparar video
            </Button>
          ) : null}

          {TERMINAL.has(job.status) ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="ml-auto"
              aria-label="Eliminar video"
              onClick={() => onDelete(job)}
              disabled={isPending}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          {new Date(job.created_at).toLocaleString("es-ES")}
        </p>
      </CardContent>
    </Card>
  );
}
