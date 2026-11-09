-- CreateTable
CREATE TABLE "VideoProviderKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "VideoProviderKey_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VideoJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'klinggiare',
    "provider_batch_id" INTEGER,
    "provider_job_id" INTEGER,
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

-- CreateIndex
CREATE INDEX "VideoProviderKey_user_id_idx" ON "VideoProviderKey"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "VideoProviderKey_user_id_provider_key" ON "VideoProviderKey"("user_id", "provider");

-- CreateIndex
CREATE INDEX "VideoJob_user_id_created_at_idx" ON "VideoJob"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "VideoJob_user_id_status_idx" ON "VideoJob"("user_id", "status");
