"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { deleteConversation } from "@/app/actions/conversations";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId?: string;
}

export function ConversationSidebar({ conversations, activeId }: ConversationSidebarProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await deleteConversation(id);
      setPendingId(null);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (activeId === id) {
        router.push("/");
      } else {
        router.refresh();
      }
    });
  }

  if (conversations.length === 0) {
    return (
      <p className="px-2 text-sm text-muted-foreground">
        Todavía no hay conversaciones guardadas.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {conversations.map((conversation) => {
        const isActive = conversation.id === activeId;

        return (
          <li key={conversation.id} className="group/item relative">
            <Link
              href={`/?c=${conversation.id}`}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg border-l-2 border-transparent px-2.5 py-2 pr-8 text-sm transition-colors hover:bg-muted",
                isActive && "border-primary bg-primary/10 text-primary",
              )}
            >
              <span className="line-clamp-1">{conversation.title}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(conversation.updated_at).toLocaleDateString("es-ES", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </Link>

            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1.5 right-1 opacity-0 transition-opacity group-hover/item:opacity-100"
              disabled={pendingId === conversation.id}
              onClick={() => handleDelete(conversation.id)}
              aria-label={`Eliminar ${conversation.title}`}
            >
              {pendingId === conversation.id ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <Trash2Icon />
              )}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
