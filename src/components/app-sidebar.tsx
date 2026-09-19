"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  HistoryIcon,
  Loader2Icon,
  LogOutIcon,
  MessagesSquareIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { deleteConversation } from "@/app/actions/conversations";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";

const LINKS = [
  { href: "/", label: "Chat", icon: MessagesSquareIcon },
  { href: "/perfiles", label: "Perfiles", icon: UsersIcon },
  { href: "/ajustes", label: "Ajustes", icon: SettingsIcon },
  { href: "/historial", label: "Historial", icon: HistoryIcon },
];

export function AppSidebar({ conversations = [] }: { conversations?: Conversation[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const activeId = pathname === "/" ? (searchParams.get("c") ?? undefined) : undefined;
  const showConversations = pathname === "/";

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

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar/60 backdrop-blur-xl">
      <Link href="/" className="group flex items-center gap-2.5 px-4 py-5">
        <span className="glow-primary flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform group-hover:scale-105">
          <SparklesIcon className="size-4" />
        </span>
        <span className="text-gradient font-heading text-base font-bold tracking-tight">
          Social Estudio
        </span>
      </Link>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3">
        {showConversations ? (
          <>
            <p className="px-2 font-heading text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Conversaciones
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="px-2 text-sm text-muted-foreground">
                  Todavía no hay conversaciones guardadas.
                </p>
              ) : (
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
              )}
            </div>
          </>
        ) : null}
      </div>

      <nav className="flex flex-col gap-1 border-t border-border/60 p-3">
        {LINKS.map((link) => {
          const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {link.label}
            </Link>
          );
        })}

        <form action={signOut}>
          <Button
            variant="ghost"
            type="submit"
            className="w-full cursor-pointer justify-start text-muted-foreground hover:text-foreground"
          >
            <LogOutIcon />
            Salir
          </Button>
        </form>
      </nav>
    </aside>
  );
}
