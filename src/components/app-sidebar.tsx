"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  Loader2Icon,
  LogOutIcon,
  MessagesSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";
import { toast } from "sonner";

import { signOut } from "@/app/actions/auth";
import { deleteConversation, updateConversation } from "@/app/actions/conversations";
import { createProject, deleteProject, renameProject } from "@/app/actions/projects";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Conversation, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Chat", icon: MessagesSquareIcon },
  { href: "/perfiles", label: "Perfiles", icon: UsersIcon },
  { href: "/perfiles-video", label: "Perfiles de video", icon: VideoIcon },
  { href: "/ajustes", label: "Ajustes", icon: SettingsIcon },
  { href: "/guiones", label: "Guiones", icon: FileTextIcon },
];

function isLinkActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  isPending: boolean;
  projects: Project[];
  onDelete: (id: string) => void;
  onMove: (id: string, projectId: string | null) => void;
}

function ConversationItem({
  conversation,
  isActive,
  isPending,
  projects,
  onDelete,
  onMove,
}: ConversationItemProps) {
  return (
    <li className="group/item relative">
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

      <div className="absolute top-1.5 right-1 opacity-0 transition-opacity group-hover/item:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Opciones de ${conversation.title}`}
          >
            {isPending ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <MoreHorizontalIcon className="size-3.5" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Mover a</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => onMove(conversation.id, null)}>
                  Sin proyecto
                </DropdownMenuItem>
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => onMove(conversation.id, project.id)}
                  >
                    {project.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(conversation.id)}
            >
              <Trash2Icon />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export function AppSidebar({
  conversations = [],
  projects = [],
}: {
  conversations?: Conversation[];
  projects?: Project[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const activeId = pathname === "/" ? (searchParams.get("c") ?? undefined) : undefined;
  const showConversations = pathname === "/";

  const ungrouped = conversations.filter((conversation) => !conversation.project_id);
  const groups = projects.map((project) => ({
    project,
    items: conversations.filter((conversation) => conversation.project_id === project.id),
  }));

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

  function openCreateProject() {
    setEditingProject(null);
    setProjectName("");
    setProjectDialogOpen(true);
  }

  function openRenameProject(project: Project) {
    setEditingProject(project);
    setProjectName(project.name);
    setProjectDialogOpen(true);
  }

  function handleSaveProject() {
    const name = projectName.trim();
    if (!name) return;

    startTransition(async () => {
      const result = editingProject
        ? await renameProject(editingProject.id, name)
        : await createProject({ name });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(editingProject ? "Proyecto renombrado." : "Proyecto creado.");
      setProjectDialogOpen(false);
      router.refresh();
    });
  }

  function handleDeleteProject() {
    if (!projectToDelete) return;
    const id = projectToDelete.id;

    const removedActive = conversations.some(
      (conversation) => conversation.project_id === id && conversation.id === activeId,
    );

    startTransition(async () => {
      const result = await deleteProject(id);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Proyecto eliminado.");
      setProjectToDelete(null);

      if (removedActive) {
        router.push("/");
      } else {
        router.refresh();
      }
    });
  }

  const renderItem = (conversation: Conversation) => (
    <ConversationItem
      key={conversation.id}
      conversation={conversation}
      isActive={conversation.id === activeId}
      isPending={pendingId === conversation.id}
      projects={projects}
      onDelete={handleDelete}
      onMove={handleMove}
    />
  );

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

      <div className="flex min-h-0 flex-1 flex-col gap-1 px-3">
        {showConversations ? (
          <>
            <div className="flex items-center justify-between px-2">
              <p className="font-heading text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Conversaciones
              </p>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={openCreateProject}
                title="Nuevo proyecto"
                aria-label="Nuevo proyecto"
              >
                <FolderPlusIcon />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {conversations.length === 0 && projects.length === 0 ? (
                <p className="px-2 text-sm text-muted-foreground">
                  Todavía no hay conversaciones guardadas.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {groups.map(({ project, items }) => (
                    <div key={project.id} className="flex flex-col">
                      <div className="flex items-center gap-1 px-2 pt-3 pb-1">
                        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          {project.name}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`Opciones de ${project.name}`}
                          >
                            <MoreHorizontalIcon className="size-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openRenameProject(project)}>
                              <PencilIcon />
                              Renombrar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setProjectToDelete(project)}
                            >
                              <Trash2Icon />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <ul className="flex flex-col gap-0.5">
                        {items.length === 0 ? (
                          <li className="px-2.5 py-1 text-xs text-muted-foreground">
                            Sin conversaciones
                          </li>
                        ) : (
                          items.map(renderItem)
                        )}
                      </ul>
                    </div>
                  ))}

                  {ungrouped.length > 0 ? (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1 px-2 pt-3 pb-1">
                        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Sin proyecto
                        </span>
                      </div>
                      <ul className="flex flex-col gap-0.5">{ungrouped.map(renderItem)}</ul>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      <nav className="flex flex-col gap-1 border-t border-border/60 p-3">
        {LINKS.map((link) => {
          const isActive = isLinkActive(pathname, link.href);
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

      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingProject ? "Renombrar proyecto" : "Nuevo proyecto"}</DialogTitle>
            <DialogDescription>
              Agrupa conversaciones por proyecto o carpeta para tenerlas organizadas.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Nombre</Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSaveProject();
                }
              }}
              placeholder="Ej. Cliente X"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveProject}
              disabled={isPending || projectName.trim().length === 0}
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              {editingProject ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={projectToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setProjectToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el proyecto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{projectToDelete?.name}» y todas sus conversaciones, incluidos sus
              mensajes y adjuntos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} disabled={isPending}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
