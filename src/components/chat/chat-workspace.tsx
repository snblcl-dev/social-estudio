"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BotIcon,
  ChevronRightIcon,
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  PaperclipIcon,
  SaveIcon,
  SendIcon,
  Settings2Icon,
  SparklesIcon,
  SquareIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { saveConversationMessages, updateConversation } from "@/app/actions/conversations";
import { saveScript } from "@/app/actions/scripts";
import { ModelSelect } from "@/components/model-select";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ATTACHMENT_ACCEPT,
  JPEG_QUALITY,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_DIMENSION,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  formatBytes,
  isImageMediaType,
  isSupportedAttachment,
  normalizeMediaType,
} from "@/lib/attachments";
import { REASONING_EFFORT_OPTIONS } from "@/lib/reasoning";
import type {
  Conversation,
  Profile,
  ProviderKey,
  ProviderOption,
  ReasoningEffort,
} from "@/lib/types";
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

function reasoningOf(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === "reasoning" ? part.text : ""))
    .join("")
    .trim();
}

function ReasoningBlock({ text }: { text: string }) {
  return (
    <details className="group w-full rounded-2xl rounded-tl-sm border border-border/60 bg-muted/30 px-4 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground select-none">
        <ChevronRightIcon className="size-3.5 transition-transform group-open:rotate-90" />
        Razonamiento
      </summary>
      <div className="mt-2 text-sm break-words whitespace-pre-wrap text-muted-foreground">
        {text}
      </div>
    </details>
  );
}

interface PendingAttachment {
  id: string;
  filename: string;
  mediaType: string;
  /** Tamaño original del archivo elegido. */
  originalSize: number;
  /** Tamaño ya comprimido que se enviará y persistirá. */
  compressedSize: number;
  /** Data URL que se envía al modelo y se persiste. */
  url: string;
  /** Vista previa para imágenes (mismo data URL). */
  previewUrl: string | null;
}

interface MessageFile {
  mediaType: string;
  filename?: string;
  url: string;
}

const PNG_KEEP_MAX_BYTES = 1.5 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo procesar la imagen."));
    image.src = src;
  });
}

/** Longitud aproximada en bytes del contenido de una data URL. */
function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const body = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  return Math.floor((body.length * 3) / 4);
}

/** Reduce imágenes grandes en el navegador antes de enviarlas. */
async function prepareImage(file: File): Promise<{ url: string; mediaType: string }> {
  const dataUrl = await fileToDataUrl(file);

  // Los GIF pueden ser animados: no se re-codifican.
  if (file.type === "image/gif") return { url: dataUrl, mediaType: file.type };

  try {
    const image = await loadImageElement(dataUrl);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
    const needsResize = scale < 1;

    // Imagen ya pequeña: se envía sin recomprimir.
    if (!needsResize && file.size <= 1024 * 1024) {
      return { url: dataUrl, mediaType: file.type };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext("2d");
    if (!context) return { url: dataUrl, mediaType: file.type };

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Un PNG solo se conserva si el resultado no es demasiado pesado (así
    // las capturas con texto quedan nítidas); si no, se pasa a JPEG.
    if (file.type === "image/png") {
      const png = canvas.toDataURL("image/png");
      if (dataUrlByteLength(png) <= PNG_KEEP_MAX_BYTES) {
        return { url: png, mediaType: "image/png" };
      }
    }

    return {
      url: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
      mediaType: "image/jpeg",
    };
  } catch {
    return { url: dataUrl, mediaType: file.type };
  }
}

function filesOf(message: UIMessage): MessageFile[] {
  return message.parts
    .filter((part) => part.type === "file")
    .map((part) => {
      const file = part as { mediaType: string; filename?: string; url: string };
      return { mediaType: file.mediaType, filename: file.filename, url: file.url };
    });
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
  const [showReasoning, setShowReasoning] = useState(conversation.show_reasoning);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
    conversation.reasoning_effort,
  );
  const [isSavingScript, setIsSavingScript] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  // dispone del contexto de la petición y de la sesión.
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

  function handleAttachClick() {
    fileInputRef.current?.click();
  }

  async function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0) return;

    const available = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;
    if (available <= 0) {
      toast.error(`Máximo ${MAX_ATTACHMENTS_PER_MESSAGE} adjuntos por mensaje.`);
      return;
    }

    const accepted = selected.slice(0, available);
    if (selected.length > available) {
      toast.error(
        `Solo se añadieron ${available}: máximo ${MAX_ATTACHMENTS_PER_MESSAGE} adjuntos por mensaje.`,
      );
    }

    setIsPreparingFiles(true);

    try {
      const prepared: PendingAttachment[] = [];

      for (const file of accepted) {
        if (!isSupportedAttachment(file)) {
          toast.error(`Tipo de archivo no admitido: ${file.name}`);
          continue;
        }

        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(
            `${file.name} supera el límite de ${formatBytes(MAX_ATTACHMENT_BYTES)}.`,
          );
          continue;
        }

        const mediaType = normalizeMediaType(file);
        const isImage = isImageMediaType(mediaType);
        const result = isImage
          ? await prepareImage(file)
          : { url: await fileToDataUrl(file), mediaType };

        prepared.push({
          id: crypto.randomUUID(),
          filename: file.name,
          mediaType: result.mediaType,
          originalSize: file.size,
          compressedSize: dataUrlByteLength(result.url),
          url: result.url,
          previewUrl: isImage ? result.url : null,
        });
      }

      setAttachments((current) => [...current, ...prepared]);
    } catch {
      toast.error("No se pudieron preparar los adjuntos.");
    } finally {
      setIsPreparingFiles(false);
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((item) => item.id !== id));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    const files = attachments.map((item) => ({
      type: "file" as const,
      mediaType: item.mediaType,
      filename: item.filename,
      url: item.url,
    }));

    if ((!text && files.length === 0) || isBusy || isPreparingFiles) return;

    const totalAttachmentBytes = attachments.reduce(
      (sum, item) => sum + dataUrlByteLength(item.url),
      0,
    );

    if (totalAttachmentBytes > MAX_MESSAGE_ATTACHMENT_BYTES) {
      toast.error(
        `Los adjuntos pesan ${formatBytes(totalAttachmentBytes)}; el máximo por mensaje es ${formatBytes(MAX_MESSAGE_ATTACHMENT_BYTES)}.`,
      );
      return;
    }

    setInput("");
    setAttachments([]);
    clearError();

    const message =
      files.length > 0 ? (text ? { text, files } : { files }) : { text };

    try {
      await sendMessage(message, {
        body: {
          conversationId: conversation.id,
          profileId: profileId || null,
          provider,
          model,
          reasoning: reasoningEffort,
        },
      });
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

  function handleReasoningEffortChange(next: ReasoningEffort) {
    setReasoningEffort(next);
    void updateConversation({ id: conversation.id, reasoningEffort: next }).then((result) => {
      if (result.error) toast.error(result.error);
    });
  }

  function handleShowReasoningChange(next: boolean) {
    setShowReasoning(next);
    void updateConversation({ id: conversation.id, showReasoning: next }).then((result) => {
      if (result.error) toast.error(result.error);
    });
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
            reasoning: reasoningEffort,
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
              const isUser = message.role === "user";
              const reasoning = isUser ? "" : reasoningOf(message);
              const files = filesOf(message);

              if (!text && files.length === 0 && !(showReasoning && reasoning)) {
                return null;
              }

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
                      "flex max-w-[85%] flex-col gap-2",
                      isUser ? "items-end" : "items-start",
                    )}
                  >
                    {showReasoning && reasoning ? <ReasoningBlock text={reasoning} /> : null}
                    {files.length > 0 ? (
                      <div
                        className={cn(
                          "flex max-w-full flex-wrap gap-2",
                          isUser ? "justify-end" : "justify-start",
                        )}
                      >
                        {files.map((file, index) =>
                          isImageMediaType(file.mediaType) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={index}
                              src={file.url}
                              alt={file.filename ?? "adjunto"}
                              className="max-h-48 rounded-xl border border-border/60 object-contain"
                            />
                          ) : (
                            <a
                              key={index}
                              href={file.url}
                              download={file.filename}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs"
                            >
                              <FileTextIcon className="size-3.5" />
                              {file.filename ?? file.mediaType}
                            </a>
                          ),
                        )}
                      </div>
                    ) : null}
                    {text ? (
                      <div
                        className={cn(
                          "max-w-full rounded-2xl px-4 py-2.5 text-sm break-words whitespace-pre-wrap",
                          isUser
                            ? "rounded-tr-sm bg-primary text-primary-foreground"
                            : "rounded-tl-sm border border-border/60 bg-muted/60 text-foreground",
                        )}
                      >
                        {text}
                      </div>
                    ) : null}
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={handleFilesSelected}
        />

        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {attachments.map((item) => (
              <div
                key={item.id}
                className="relative flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 py-1.5 pr-7 pl-1.5 text-xs"
              >
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt={item.filename}
                    className="size-9 rounded object-cover"
                  />
                ) : (
                  <span className="flex size-8 items-center justify-center rounded bg-primary/10 text-primary">
                    <FileTextIcon className="size-4" />
                  </span>
                )}
                <span className="flex flex-col">
                  <span className="max-w-[12rem] truncate">{item.filename}</span>
                  <span className="text-muted-foreground">
                    {item.compressedSize !== item.originalSize
                      ? `${formatBytes(item.originalSize)} → ${formatBytes(item.compressedSize)}`
                      : formatBytes(item.originalSize)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(item.id)}
                  aria-label={`Quitar ${item.filename}`}
                  className="absolute top-1 right-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

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
          <Button
            type="button"
            variant="outline"
            onClick={handleAttachClick}
            disabled={isBusy || isPreparingFiles}
            title="Adjuntar imágenes, PDF o texto"
          >
            {isPreparingFiles ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
            Adjuntar
          </Button>

          <Button
            type="submit"
            disabled={
              isBusy ||
              isPreparingFiles ||
              (input.trim().length === 0 && attachments.length === 0)
            }
          >
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

                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor="chat-reasoning"
                      className="text-xs text-muted-foreground"
                    >
                      Esfuerzo de razonamiento
                    </Label>
                    <NativeSelect
                      id="chat-reasoning"
                      value={reasoningEffort}
                      className="w-full"
                      onChange={(event) =>
                        handleReasoningEffortChange(event.target.value as ReasoningEffort)
                      }
                    >
                      {REASONING_EFFORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>

                  <label className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/50 px-2.5 py-2 text-xs">
                    <span className="text-muted-foreground">Mostrar razonamiento</span>
                    <input
                      type="checkbox"
                      checked={showReasoning}
                      onChange={(event) => handleShowReasoningChange(event.target.checked)}
                      className="size-4 accent-primary"
                    />
                  </label>

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
