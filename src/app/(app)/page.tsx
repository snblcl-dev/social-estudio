import type { UIMessage } from "ai";

import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { NewConversationForm } from "@/components/chat/new-conversation-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getConversation, listConversations, listMessages } from "@/lib/data/conversations";
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

  const [profiles, settings, configuredProviders, conversations] = await Promise.all([
    listProfiles(user.id),
    getSettings(user.id),
    listConfiguredProviders(user.id),
    listConversations(user.id),
  ]);

  const defaultProvider: ProviderId = isProviderId(settings.default_provider)
    ? settings.default_provider
    : (configuredProviders[0] ?? "openai");

  const conversation = c ? await getConversation(user.id, c) : null;

  let initialMessages: UIMessage[] = [];

  if (conversation) {
    const rows = await listMessages(user.id, conversation.id);

    initialMessages = rows.map((row) => ({
      id: row.id,
      role: row.role,
      parts: row.parts,
    })) as UIMessage[];
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-2">
          <h2 className="font-heading text-sm font-medium">Conversaciones</h2>
        </div>
        <ConversationSidebar conversations={conversations} activeId={conversation?.id} />
      </aside>

      {conversation ? (
        <ChatWorkspace
          key={conversation.id}
          conversation={conversation}
          profiles={profiles}
          initialMessages={initialMessages}
          hasImageInstructions={settings.image_prompt_instructions.trim().length > 0}
        />
      ) : (
        <Card>
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
      )}
    </div>
  );
}
