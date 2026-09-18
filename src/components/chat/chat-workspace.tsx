"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CopyIcon,
  ImageIcon,
  Loader2Icon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  SquareIcon,
} from "lucide-react";
import { toast } from "sonner";

import { saveConversationMessages } from "@/app/actions/conversations";
import { saveScript } from "@/app/actions/scripts";
import { ModelSelect } from "@/components/model-select";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PROVIDERS } from "@/lib/providers";
import type { Conversation, ImagePrompt, Profile, ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatWorkspaceProps {
  conversation: Conversation;
  profiles: Profile[];
  initialMessages: UIMessage[];
}

function textOf(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
  } catch {
    toast.error("No se pudo copiar al portapapeles.");
  }
}

export function ChatWorkspace({
  conversation,
  profiles,
  initialMessages,
}: ChatWorkspaceProps) {
  const router = useRouter();
  const [initial] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<ProviderId>(conversation.provider);
  const [model, setModel] = useState(
    conversation.model || PROVIDERS[conversation.provider].defaultModel,
  );
  const [profileId, setProfileId] = useState(conversation.profile_id ?? "");
  const [imagePrompts, setImagePrompts] = useState<ImagePrompt[]>([]);
  const [promptsSource, setPromptsSource] = useState<string>("");
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [isSavingScript, setIsSavingScript] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const savedSignatureRef = useRef(
    `${initial.length}:${initial[initial.length - 1]?.id ?? ""}`,
  );

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);

  const { messages, sendMessage, status, error, clearError, stop } = useChat({
    id: conversation.id,
    messages: initial,
    transport,
  });

  const isBusy = status === "submitted" || status === "streaming";

  // Guarda el historial en el servidor cuando la respuesta termina.
  // Se hace desde el cliente (Server Action) para garantizar que la escritura
  // en Supabase dispone del contexto de la petición y de la sesión.
  useEffect(() => {
    if (status !== "ready" || messages.length === 0) return;

    const signature = `${messages.length}:${messages[messages.length - 1]?.id ?? ""}`;
    if (savedSignatureRef.current === signature) return;
    savedSignatureRef.current = signature;

    const payload = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts,
      }));

    void saveConversationMessages({
      conversationId: conversation.id,
      provider,
      model,
      profileId: profileId || null,
      messages: payload,
    }).then((result) => {
      if (result.error) {
        console.error("[chat] no se pudo guardar el historial:", result.error);
        toast.error(`No se pudo guardar el historial: ${result.error}`);
      }
    });
  }, [status, messages, conversation.id, provider, model, profileId]);

  const lastAssistantText = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant") {
        const text = textOf(message);
        if (text) return text;
      }
    }
    return "";
  }, [messages]);

  const activeProfile = profiles.find((profile) => profile.id === profileId) ?? null;
  const hasImageInstructions = Boolean(activeProfile?.image_prompt_instructions?.trim());

  const visiblePrompts = promptsSource === lastAssistantText ? imagePrompts : [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();

    if (!text || isBusy) return;

    setInput("");
    clearError();

    try {
      await sendMessage(
        { text },
        {
          body: {
            conversationId: conversation.id,
            profileId: profileId || null,
            provider,
            model,
          },
        },
      );
    } catch (sendError) {
      toast.error(
        sendError instanceof Error ? sendError.message : "No se pudo enviar el mensaje.",
      );
    } finally {
      router.refresh();
    }
  }

  function handleProviderChange(next: ProviderId) {
    setProvider(next);
    setModel(PROVIDERS[next].defaultModel);
  }

  async function handleGeneratePrompts() {
    if (!lastAssistantText) {
      toast.error("Todavía no hay un guion para analizar.");
      return;
    }

    setIsGeneratingPrompts(true);

    try {
      const response = await fetch("/api/image-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: lastAssistantText,
          provider,
          model,
          profileId: profileId || null,
        }),
      });

      const raw = await response.text();

      let data: { imagePrompts?: ImagePrompt[]; error?: string } = {};
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        // La respuesta no era JSON (por ejemplo un error de plataforma).
      }

      if (!response.ok || !data.imagePrompts) {
        throw new Error(
          data.error ??
            (raw.trim().slice(0, 200) || `El servidor devolvió un error (${response.status}).`),
        );
      }
      setImagePrompts(data.imagePrompts);
      setPromptsSource(lastAssistantText);
      toast.success(`${data.imagePrompts.length} prompts generados.`);
    } catch (promptError) {
      toast.error(
        promptError instanceof Error ? promptError.message : "Error al generar los prompts.",
      );
    } finally {
      setIsGeneratingPrompts(false);
    }
  }

  async function handleSaveScript() {
    if (!lastAssistantText) {
      toast.error("Todavía no hay un guion que guardar.");
      return;
    }

    setIsSavingScript(true);

    try {
      const result = await saveScript({
        conversationId: conversation.id,
        profileId: profileId || null,
        title: conversation.title || "Guion sin título",
        content: lastAssistantText,
        imagePrompts: visiblePrompts,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Guion guardado en el historial.");
      router.refresh();
    } finally {
      setIsSavingScript(false);
    }
  }

  const allPrompts = visiblePrompts.map((item) => item.prompt).join("\n\n");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-h-[70vh] flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chat-profile" className="text-xs">
              Perfil
            </Label>
            <NativeSelect
              id="chat-profile"
              value={profileId}
              className="w-44"
              onChange={(event) => setProfileId(event.target.value)}
            >
              <option value="">Sin perfil</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chat-provider" className="text-xs">
              Proveedor
            </Label>
            <NativeSelect
              id="chat-provider"
              value={provider}
              className="w-40"
              onChange={(event) => handleProviderChange(event.target.value as ProviderId)}
            >
              {Object.values(PROVIDERS).map((info) => (
                <option key={info.id} value={info.id}>
                  {info.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chat-model" className="text-xs">
              Modelo
            </Label>
            <div className="w-56">
              <ModelSelect provider={provider} value={model} onChange={setModel} />
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto rounded-xl border bg-card p-4"
          style={{ maxHeight: "60vh" }}
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <SparklesIcon className="size-6" />
              <p className="max-w-md">
                Escribe el tema o la idea que quieres convertir en guion. También puedes pedir
                sugerencias de temas.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((message) => {
                const text = textOf(message);
                if (!text) return null;

                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {text}
                    </div>
                  </div>
                );
              })}

              {isBusy ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  Generando…
                </div>
              ) : null}
            </div>
          )}
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error.message}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit(event);
              }
            }}
            rows={3}
            placeholder="Escribe tu tema o petición… (Enter para enviar, Shift+Enter para salto de línea)"
            className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isBusy || input.trim().length === 0}>
              {isBusy ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              Enviar
            </Button>

            {isBusy ? (
              <Button type="button" variant="outline" onClick={() => stop()}>
                <SquareIcon />
                Detener
              </Button>
            ) : null}

            <span className="ml-auto text-xs text-muted-foreground">{model}</span>
          </div>
        </form>
      </div>

      <aside className="flex flex-col gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="size-4" />
              Prompts de imagen
            </CardTitle>
            <CardDescription>
              Se generan a partir del último guion usando las instrucciones de prompts de imagen
              del perfil activo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!hasImageInstructions ? (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {profileId
                  ? "Este perfil no tiene instrucciones de prompts de imagen. Añádelas en Perfiles para controlar el número de escenas y el estilo."
                  : "Elige un perfil (arriba) para usar sus instrucciones de prompts de imagen, o añádelas en Perfiles."}
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                onClick={handleGeneratePrompts}
                disabled={isGeneratingPrompts || !lastAssistantText || isBusy}
              >
                {isGeneratingPrompts ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SparklesIcon />
                )}
                Generar prompts
              </Button>

              <Button
                variant="outline"
                onClick={handleSaveScript}
                disabled={isSavingScript || !lastAssistantText}
              >
                {isSavingScript ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
                Guardar guion
              </Button>
            </div>
          </CardContent>
        </Card>

        {visiblePrompts.length > 0 ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Prompts generados</CardTitle>
              <Button
                variant="outline"
                size="xs"
                onClick={() => copyToClipboard(allPrompts, "Todos los prompts")}
              >
                <CopyIcon />
                Copiar todos
              </Button>
            </CardHeader>
            <CardContent className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto">
              {visiblePrompts.map((item) => (
                <div key={item.index} className="flex flex-col gap-1.5 rounded-lg bg-muted p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">
                      {item.index}. {item.scene}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => copyToClipboard(item.prompt, `Prompt ${item.index}`)}
                      aria-label={`Copiar prompt ${item.index}`}
                    >
                      <CopyIcon />
                    </Button>
                  </div>
                  <p className="text-xs whitespace-pre-wrap text-muted-foreground">{item.prompt}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}
