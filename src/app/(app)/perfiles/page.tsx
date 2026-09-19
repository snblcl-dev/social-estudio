import { ProfilesManager } from "@/components/profiles/profiles-manager";
import { listProfiles } from "@/lib/data/profiles";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function ProfilesPage() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const profiles = await listProfiles(user.id);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <ProfilesManager profiles={profiles} />
    </div>
  );
}
