import { ScriptsList } from "@/components/scripts/scripts-list";
import { PageHeader } from "@/components/page-header";
import { listProfiles } from "@/lib/data/profiles";
import { listScripts } from "@/lib/data/scripts";
import { getVibiKeySummary } from "@/lib/data/vibi";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function HistoryPage() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const [scripts, profiles, vibiKey] = await Promise.all([
    listScripts(user.id),
    listProfiles(user.id),
    getVibiKeySummary(user.id),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      <PageHeader
        title="Historial"
        description="Guiones guardados, sus prompts de imagen y la voz generada."
      />

      <ScriptsList scripts={scripts} profiles={profiles} hasVibiKey={Boolean(vibiKey)} />
    </div>
  );
}
