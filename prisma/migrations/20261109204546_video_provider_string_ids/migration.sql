-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VideoJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'klinggiare',
    "provider_batch_id" TEXT,
    "provider_job_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "job_type" TEXT NOT NULL DEFAULT 'image_to_video',
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "aspect_ratio" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "audio" BOOLEAN NOT NULL DEFAULT false,
    "has_end_frame" BOOLEAN NOT NULL DEFAULT false,
    "input_object_key" TEXT,
    "tail_object_key" TEXT,
    "motion_video_key" TEXT,
    "thumbnail_url" TEXT,
    "video_path" TEXT,
    "provider_video_url" TEXT,
    "price_amount" INTEGER,
    "price_currency" TEXT NOT NULL DEFAULT 'VND',
    "price_snapshot" TEXT NOT NULL DEFAULT '{}',
    "error_code" TEXT,
    "error_message" TEXT,
    "eta_ms" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "finished_at" DATETIME,
    CONSTRAINT "VideoJob_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VideoJob" ("aspect_ratio", "audio", "created_at", "duration_seconds", "error_code", "error_message", "eta_ms", "finished_at", "has_end_frame", "id", "input_object_key", "job_type", "model", "motion_video_key", "price_amount", "price_currency", "price_snapshot", "prompt", "provider", "provider_batch_id", "provider_job_id", "provider_video_url", "resolution", "status", "tail_object_key", "thumbnail_url", "updated_at", "user_id", "video_path") SELECT "aspect_ratio", "audio", "created_at", "duration_seconds", "error_code", "error_message", "eta_ms", "finished_at", "has_end_frame", "id", "input_object_key", "job_type", "model", "motion_video_key", "price_amount", "price_currency", "price_snapshot", "prompt", "provider", "provider_batch_id", "provider_job_id", "provider_video_url", "resolution", "status", "tail_object_key", "thumbnail_url", "updated_at", "user_id", "video_path" FROM "VideoJob";
DROP TABLE "VideoJob";
ALTER TABLE "new_VideoJob" RENAME TO "VideoJob";
CREATE INDEX "VideoJob_user_id_created_at_idx" ON "VideoJob"("user_id", "created_at");
CREATE INDEX "VideoJob_user_id_status_idx" ON "VideoJob"("user_id", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
