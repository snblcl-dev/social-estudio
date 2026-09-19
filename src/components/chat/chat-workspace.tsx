"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BotIcon,
  ImageIcon,
  Loader2Icon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  SquareIcon,
  UserIcon,
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
import type { Conversation, Profile, ProviderId } from "@/lib/types";
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

  async function handleGenerateImagePrompts() {
    if (isBusy) return;

    if (!lastAssistantText) {
      toast.error("Todavía no hay un guion para analizar.");
      return;
    }

    clearError();

    try {
      await sendMessage(
        {
          text: "Genera los prompts de imagen para el guion anterior, siguiendo las instrucciones de prompts de imagen del perfil.",
        },
        {
          body: {
            conversationId: conversation.id,
            profileId: profileId || null,
            provider,
            model,
            mode: "image-prompts",
          },
        },
      );
    } catch (sendError) {
      toast.error(
        sendError instanceof Error
          ? sendError.message
          : "No se pudieron generar los prompts.",
      );
    } finally {
      router.refresh();
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
        imagePrompts: [],
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Última respuesta guardada en el historial.");
      router.refresh();
    } finally {
      setIsSavingScript(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-h-[70vh] flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card/50 p-3 backdrop-blur-sm">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chat-profile" className="text-xs text-muted-foreground">
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
            <Label htmlFor="chat-provider" className="text-xs text-muted-foreground">
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
            <Label htmlFor="chat-model" className="text-xs text-muted-foreground">
              Modelo
            </Label>
            <div className="w-56">
              <ModelSelect provider={provider} value={model} onChange={setModel} />
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm"
          style={{ maxHeight: "60vh" }}
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="glow-primary flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <SparklesIcon className="size-6" />
              </span>
              <div className="flex flex-col gap-1">
                <p className="font-heading text-base font-semibold">Empieza tu guion</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Escribe el tema o la idea que quieres convertir en guion. También puedes pedir
                  sugerencias de temas.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {messages.map((message) => {
                const text = textOf(message);
                if (!text) return null;

                const isUser = message.role === "user";

                return (
                  <div
                    key={message.id}
                    className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                        isUser
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-primary/15 text-primary",
                      )}
                    >
                      {isUser ? (
                        <UserIcon className="size-3.5" />
                      ) : (
                        <BotIcon className="size-3.5" />
                      )}
                    </span>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm break-words whitespace-pre-wrap",
                        isUser
                          ? "rounded-tr-sm bg-primary text-primary-foreground"
                          : "rounded-tl-sm border border-border/60 bg-muted/60 text-foreground",
                      )}
                    >
                      {text}
                    </div>
                  </div>
                );
              })}

              {isBusy ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <BotIcon className="size-3.5" />
                  </span>
                  <span className="flex items-center gap-2">
                    <Loader2Icon className="size-4 animate-spin" />
                    Generando…
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {error ? (
          <p
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error.message}
          </p>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/50 p-3 backdrop-blur-sm"
        >
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
            aria-label="Mensaje para el asistente"
            placeholder="Escribe tu tema o petición… (Enter para enviar, Shift+Enter para salto de línea)"
            className="w-full resize-y rounded-lg border border-input bg-input/20 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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

            <span className="ml-auto rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
              {model}
            </span>
          </div>
        </form>
      </div>

      <aside className="flex flex-col gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-accent/15 text-accent">
                <ImageIcon className="size-3.5" />
              </span>
              Prompts de imagen
            </CardTitle>
            <CardDescription>
              Las instrucciones de prompts de imagen del perfil activo se aplican siempre, tanto
              si las pides escribiendo en el chat como con el botón.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="rounded-lg border border-border/60 bg-muted/50 p-2.5 text-xs">
              {activeProfile ? (
                hasImageInstructions ? (
                  <>
                    <span className="font-medium">Perfil: {activeProfile.name}</span>
                    <br />
                    {activeProfile.image_prompt_instructions.trim().length} caracteres de
                    instrucciones de imagen.
                  </>
                ) : (
                  <span className="text-amber-500">
                    El perfil «{activeProfile.name}» no tiene instrucciones de prompts de imagen.
                    Añádelas en Perfiles.
                  </span>
                )
              ) : (
                <span className="text-amber-500">
                  Sin perfil seleccionado: se usarán instrucciones genéricas (3-6 escenas).
                </span>
              )}
            </div>

            <Button
              variant="secondary"
              onClick={handleGenerateImagePrompts}
              disabled={isBusy || !lastAssistantText}
            >
              {isBusy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Pedir prompts de imagen
            </Button>

            <Button
              variant="outline"
              onClick={handleSaveScript}
              disabled={isSavingScript || !lastAssistantText}
            >
              {isSavingScript ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              Guardar respuesta en historial
            </Button>

            <p className="text-xs text-muted-foreground">
              Los prompts aparecerán como un mensaje del asistente; puedes copiarlos desde ahí.
              Gestiona las instrucciones en{" "}
              <Link href="/perfiles" className="text-primary underline underline-offset-4">
                Perfiles
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
