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
  Settings2Icon,
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
import { Label } from "@/components/ui/label";
import type { Conversation, Profile, ProviderKey, ProviderOption } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatWorkspaceProps {
  conversation: Conversation;
  profiles: Profile[];
  providerOptions: ProviderOption[];
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
  providerOptions,
  initialMessages,
}: ChatWorkspaceProps) {
  const router = useRouter();
  const [initial] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<ProviderKey>(conversation.provider);
  const [model, setModel] = useState(
    conversation.model ||
      providerOptions.find((option) => option.key === conversation.provider)?.defaultModel ||
      "",
  );
  const [profileId, setProfileId] = useState(conversation.profile_id ?? "");
  const [isSavingScript, setIsSavingScript] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!showSettings) return;

    function handlePointerDown(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowSettings(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showSettings]);

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

  function handleProviderChange(next: ProviderKey) {
    setProvider(next);
    setModel(providerOptions.find((option) => option.key === next)?.defaultModel ?? "");
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

      toast.success("Última respuesta guardada en Guiones.");
      router.refresh();
    } finally {
      setIsSavingScript(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm"
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
          rows={2}
          aria-label="Mensaje para el asistente"
          placeholder="Escribe tu tema o petición… (Enter para enviar, Shift+Enter para salto de línea)"
          className="w-full resize-none rounded-lg border border-input bg-input/20 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        <div className="flex flex-wrap items-center gap-2">
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

          <Button
            type="button"
            variant="outline"
            onClick={handleGenerateImagePrompts}
            disabled={isBusy || !lastAssistantText}
            title="Pedir prompts de imagen al modelo"
          >
            <SparklesIcon />
            Prompts de imagen
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleSaveScript}
            disabled={isSavingScript || !lastAssistantText}
            title="Guardar la última respuesta en Guiones"
          >
            {isSavingScript ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            Guardar
          </Button>

          <div ref={settingsRef} className="relative ml-auto">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowSettings((value) => !value)}
              aria-expanded={showSettings}
              aria-haspopup="true"
            >
              <Settings2Icon />
              Ajustes
              <span className="hidden max-w-[10rem] truncate rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground md:inline">
                {model}
              </span>
            </Button>

            {showSettings ? (
              <div className="absolute right-0 bottom-full z-30 mb-2 w-72 rounded-xl border border-border/60 bg-popover p-4 text-popover-foreground shadow-xl shadow-black/40">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="chat-profile" className="text-xs text-muted-foreground">
                      Perfil
                    </Label>
                    <NativeSelect
                      id="chat-profile"
                      value={profileId}
                      className="w-full"
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
                      className="w-full"
                      onChange={(event) =>
                        handleProviderChange(event.target.value as ProviderKey)
                      }
                    >
                      {providerOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.custom ? `${option.label} (personalizado)` : option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="chat-model" className="text-xs text-muted-foreground">
                      Modelo
                    </Label>
                    <ModelSelect
                      provider={provider}
                      value={model}
                      onChange={setModel}
                      fallbackModels={
                        providerOptions.find((option) => option.key === provider)
                          ?.suggestedModels ?? []
                      }
                      placeholder={
                        providerOptions.find((option) => option.key === provider)
                          ?.defaultModel ?? ""
                      }
                    />
                  </div>

                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/50 px-2.5 py-2 text-xs">
                    <ImageIcon className="mt-0.5 size-3.5 shrink-0 text-accent" />
                    <span className="text-muted-foreground">
                      {activeProfile ? (
                        hasImageInstructions ? (
                          <>Prompts de imagen: {activeProfile.name}</>
                        ) : (
                          <span className="text-amber-500">
                            «{activeProfile.name}» no tiene instrucciones de imagen. Añádelas en{" "}
                            <Link
                              href="/perfiles"
                              className="text-primary underline underline-offset-4"
                            >
                              Perfiles
                            </Link>
                            .
                          </span>
                        )
                      ) : (
                        <span className="text-amber-500">
                          Sin perfil: se usarán instrucciones genéricas (3-6 escenas).
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}
