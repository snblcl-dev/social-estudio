import { ScriptsList } from "@/components/scripts/scripts-list";
import { PageHeader } from "@/components/page-header";
import { listProfiles } from "@/lib/data/profiles";
import { listScripts } from "@/lib/data/scripts";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function HistoryPage() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const [scripts, profiles] = await Promise.all([
    listScripts(user.id),
    listProfiles(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Historial" description="Guiones guardados y sus prompts de imagen." />

      <ScriptsList scripts={scripts} profiles={profiles} />
    </div>
  );
}
