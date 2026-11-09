import { VideoStudio } from "@/components/videos/video-studio";
import { getVideoApiKey, getVideoKeySummary } from "@/lib/data/video-keys";
import { listVideoJobs } from "@/lib/data/video-jobs";
import { getCurrentUser } from "@/lib/session";
import type {
  VideoKeySummary,
  VideoPriceRule,
  VideoWalletInfo,
} from "@/lib/types";
import { VIDEO_PROVIDERS } from "@/lib/video/providers";
import { getVideoProvider } from "@/lib/video/registry";

export default async function VideosPage() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const [jobs, klingKey, magnificKey] = await Promise.all([
    listVideoJobs(user.id),
    getVideoKeySummary(user.id, "klinggiare"),
    getVideoKeySummary(user.id, "magnific"),
  ]);

  const keySummaries: Record<string, VideoKeySummary | null> = {
    klinggiare: klingKey,
    magnific: magnificKey,
  };

  const rulesByProvider: Record<string, VideoPriceRule[]> = {};
  const catalogErrors: Record<string, string | null> = {};

  let maintenance = false;
  let wallet: VideoWalletInfo | null = null;
  let walletError: string | null = null;

  for (const option of VIDEO_PROVIDERS) {
    try {
      const provider = getVideoProvider(option.id);
      rulesByProvider[option.id] = await provider.getPrices();
      catalogErrors[option.id] = null;

      if (option.wallet) {
        const status = await provider
          .getSystemStatus()
          .catch(() => ({ maintenance: false }));
        maintenance = status.maintenance;

        const apiKey = await getVideoApiKey(user.id, option.id);

        if (apiKey) {
          try {
            wallet = await provider.getWallet(apiKey);
          } catch (error) {
            walletError =
              error instanceof Error ? error.message : "No se pudo consultar el saldo.";
          }
        }
      }
    } catch (error) {
      rulesByProvider[option.id] = [];
      catalogErrors[option.id] =
        error instanceof Error
          ? error.message
          : "No se pudo cargar el catálogo de videos.";
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <VideoStudio
        initialJobs={jobs}
        initialRulesByProvider={rulesByProvider}
        initialCatalogErrors={catalogErrors}
        keySummaries={keySummaries}
        maintenance={maintenance}
        initialWallet={wallet}
        initialWalletError={walletError}
      />
    </div>
  );
}
