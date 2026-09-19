import type { UIMessage } from "ai";

import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { NewConversationForm } from "@/components/chat/new-conversation-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getConversation, listMessages } from "@/lib/data/conversations";
import { listProfiles } from "@/lib/data/profiles";
import { getSettings, listConfiguredProviders } from "@/lib/data/settings";
import { isProviderId } from "@/lib/providers";
import { getCurrentUser } from "@/lib/supabase/server";
import type { ProviderId } from "@/lib/types";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const { c } = await searchParams;

  const [profiles, settings, configuredProviders] = await Promise.all([
    listProfiles(user.id),
    getSettings(user.id),
    listConfiguredProviders(user.id),
  ]);

  const defaultProvider: ProviderId = isProviderId(settings.default_provider)
    ? settings.default_provider
    : (configuredProviders[0] ?? "openai");

  const conversation = c ? await getConversation(user.id, c) : null;

  let initialMessages: UIMessage[] = [];

  if (conversation) {
    const rows = await listMessages(user.id, conversation.id);

    initialMessages = rows
      .filter((row) => row.id.trim().length > 0)
      .map((row) => ({
        id: row.id,
        role: row.role,
        parts: row.parts,
      })) as UIMessage[];
  }

  if (!conversation) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 items-center overflow-y-auto p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Nueva conversación</CardTitle>
            <CardDescription>
              Elige el perfil y el modelo con el que quieres trabajar. Podrás cambiarlos en
              cualquier momento dentro del chat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewConversationForm
              profiles={profiles}
              configuredProviders={configuredProviders}
              defaultProvider={defaultProvider}
              defaultModel={settings.default_model}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <ChatWorkspace
        key={conversation.id}
        conversation={conversation}
        profiles={profiles}
        initialMessages={initialMessages}
      />
    </div>
  );
}
