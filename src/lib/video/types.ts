import type {
  VideoMode,
  VideoPriceRule,
  VideoQuote,
  VideoSettings,
  VideoWalletInfo,
} from "@/lib/types";

export interface VideoUploadFileMeta {
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface VideoUploadTarget {
  objectKey: string;
  uploadUrl: string;
  contentType: string;
}

export interface VideoQuoteInput {
  mode: VideoMode;
  settings: VideoSettings;
  imageCount: number;
  hasEndFrame: boolean;
}

export interface VideoCreateInput {
  mode: VideoMode;
  prompt: string;
  settings: VideoSettings;
  imageKeys: string[];
  endFrameKey: string | null;
  motionVideoKey: string | null;
  motionCharacterOrientation: "FULL" | "HALF";
  keepOriginalSound: boolean;
  expectedTotal: number | null;
  idempotencyKey: string;
}

export interface VideoProviderJob {
  id: number;
  batchId: number | null;
  status: string;
  errorCode: string | null;
  etaMs: number | null;
  thumbnailUrl: string | null;
  inputObjectKey: string | null;
  tailObjectKey: string | null;
  providerVideoUrl: string | null;
  prompt: string | null;
  model: string | null;
  durationSeconds: number | null;
  aspectRatio: string | null;
  resolution: string | null;
  audio: boolean | null;
  jobType: string | null;
  priceSnapshot: { amount?: number; currency?: string } | null;
}

export interface VideoBatchResult {
  id: number;
  status: string;
  jobs: VideoProviderJob[];
}

export interface VideoProviderAdapter {
  id: string;
  label: string;
  getPrices(): Promise<VideoPriceRule[]>;
  getSystemStatus(): Promise<{ maintenance: boolean }>;
  getWallet(apiKey: string): Promise<VideoWalletInfo>;
  initUploads(
    apiKey: string,
    files: VideoUploadFileMeta[],
  ): Promise<VideoUploadTarget[]>;
  completeUploads(apiKey: string, objectKeys: string[]): Promise<void>;
  quote(apiKey: string, input: VideoQuoteInput): Promise<VideoQuote>;
  createBatch(apiKey: string, input: VideoCreateInput): Promise<VideoBatchResult>;
  getJob(apiKey: string, jobId: number): Promise<VideoProviderJob>;
  listJobsByBatch(apiKey: string, batchId: number): Promise<VideoProviderJob[]>;
  getVideoUrl(apiKey: string, jobId: number): Promise<string>;
}
