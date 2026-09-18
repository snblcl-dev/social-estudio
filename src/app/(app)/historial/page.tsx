import { ScriptsList } from "@/components/scripts/scripts-list";
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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-lg font-semibold">Historial</h1>
        <p className="text-sm text-muted-foreground">
          Guiones guardados y sus prompts de imagen.
        </p>
      </div>

      <ScriptsList scripts={scripts} profiles={profiles} />
    </div>
  );
}
