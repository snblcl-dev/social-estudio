"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  FolderIcon,
  Loader2Icon,
  MessagesSquareIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  createConversation,
  deleteConversation,
  updateConversation,
} from "@/app/actions/conversations";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Conversation, Project, ProviderKey } from "@/lib/types";

interface ProjectWorkspaceProps {
  project: Project;
  conversations: Conversation[];
  projects: Project[];
  defaultProvider: ProviderKey;
  defaultModel: string;
}

export function ProjectWorkspace({
  project,
  conversations,
  projects,
  defaultProvider,
  defaultModel,
}: ProjectWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCreating, setIsCreating] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function handleCreate() {
    setIsCreating(true);
    startTransition(async () => {
      const result = await createConversation({
        profileId: null,
        projectId: project.id,
        provider: defaultProvider,
        model: defaultModel,
      });

      setIsCreating(false);

      if (result.error || !result.id) {
        toast.error(result.error ?? "No se pudo crear la conversación.");
        return;
      }

      router.push(`/?c=${result.id}`);
    });
  }

  function handleDelete(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await deleteConversation(id);
      setPendingId(null);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      router.refresh();
    });
  }

  function handleMove(id: string, projectId: string | null) {
    setPendingId(id);
    startTransition(async () => {
      const result = await updateConversation({ id, projectId });
      setPendingId(null);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={project.name}
        description="Conversaciones guardadas en este proyecto."
        actions={
          <Button onClick={handleCreate} disabled={isCreating || isPending}>
            {isCreating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            Nueva conversación
          </Button>
        }
      />

      {conversations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FolderIcon className="size-5" />
            </span>
            <p className="font-medium">Este proyecto no tiene conversaciones</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Pulsa «Nueva conversación» para crear una dentro de «{project.name}».
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
                <Link
                  href={`/?c=${conversation.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MessagesSquareIcon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{conversation.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(conversation.updated_at).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Opciones de ${conversation.title}`}
                  >
                    {pendingId === conversation.id ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <MoreHorizontalIcon className="size-3.5" />
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Mover a proyecto</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => handleMove(conversation.id, null)}>
                          Sin proyecto
                        </DropdownMenuItem>
                        {projects
                          .filter((item) => item.id !== project.id)
                          .map((item) => (
                            <DropdownMenuItem
                              key={item.id}
                              onClick={() => handleMove(conversation.id, item.id)}
                            >
                              {item.name}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => handleDelete(conversation.id)}
                    >
                      <Trash2Icon />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
