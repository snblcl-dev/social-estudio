import { PageHeader } from "@/components/page-header";
import { VideoStudio } from "@/components/videos/video-studio";
import { getVideoApiKey, getVideoKeySummary } from "@/lib/data/video-keys";
import { listVideoJobs } from "@/lib/data/video-jobs";
import { getCurrentUser } from "@/lib/session";
import type { VideoPriceRule, VideoWalletInfo } from "@/lib/types";
import { getVideoProvider } from "@/lib/video/registry";

export default async function VideosPage() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const [jobs, keySummary] = await Promise.all([
    listVideoJobs(user.id),
    getVideoKeySummary(user.id, "klinggiare"),
  ]);

  let rules: VideoPriceRule[] = [];
  let catalogError: string | null = null;
  let maintenance = false;
  let wallet: VideoWalletInfo | null = null;
  let walletError: string | null = null;

  try {
    const provider = getVideoProvider("klinggiare");
    const [prices, status] = await Promise.all([
      provider.getPrices(),
      provider.getSystemStatus().catch(() => ({ maintenance: false })),
    ]);

    rules = prices;
    maintenance = status.maintenance;

    const apiKey = await getVideoApiKey(user.id, "klinggiare");

    if (apiKey) {
      try {
        wallet = await provider.getWallet(apiKey);
      } catch (error) {
        walletError =
          error instanceof Error ? error.message : "No se pudo consultar el saldo.";
      }
    }
  } catch (error) {
    catalogError =
      error instanceof Error ? error.message : "No se pudo cargar el catálogo de videos.";
  }

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      <PageHeader
        title="Videos"
        description="Genera videos con IA a partir de un texto, una o varias imágenes, o un video de referencia (Motion Control)."
      />

      <VideoStudio
        initialJobs={jobs}
        initialRules={rules}
        catalogError={catalogError}
        maintenance={maintenance}
        hasKey={Boolean(keySummary)}
        keySource={keySummary?.source ?? null}
        initialWallet={wallet}
        initialWalletError={walletError}
      />
    </div>
  );
}
