import { notFound } from "next/navigation";

import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { listConversationsByProject } from "@/lib/data/conversations";
import { getProject, listProjects } from "@/lib/data/projects";
import { getSettings } from "@/lib/data/settings";
import { isProviderKey } from "@/lib/providers";
import { getCurrentUser } from "@/lib/session";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const { id } = await params;
  const project = await getProject(user.id, id);

  if (!project) {
    notFound();
  }

  const [conversations, settings, projects] = await Promise.all([
    listConversationsByProject(user.id, id),
    getSettings(user.id),
    listProjects(user.id),
  ]);

  const defaultProvider = isProviderKey(settings.default_provider)
    ? settings.default_provider
    : "openai";

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <ProjectWorkspace
        project={project}
        conversations={conversations}
        projects={projects}
        defaultProvider={defaultProvider}
        defaultModel={settings.default_model}
      />
    </div>
  );
}
