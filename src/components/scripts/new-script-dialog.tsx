"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { saveScript } from "@/app/actions/scripts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NewScriptDialog() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  function handleSave() {
    if (!title.trim()) {
      toast.error("Ponle un título al guion.");
      return;
    }
    if (!content.trim()) {
      toast.error("Escribe el contenido del guion.");
      return;
    }

    startTransition(async () => {
      const result = await saveScript({
        conversationId: null,
        profileId: null,
        title,
        content,
        imagePrompts: [],
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Guion agregado.");
      setOpen(false);
      setTitle("");
      setContent("");
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        Nuevo guion
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo guion</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-script-title">Título</Label>
              <Input
                id="new-script-title"
                value={title}
                placeholder="Título del guion"
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="new-script-content">Guion</Label>
              <Textarea
                id="new-script-content"
                value={content}
                className="max-h-[55vh] min-h-64 overflow-y-auto"
                placeholder="Escribe o pega el guion…"
                onChange={(event) => setContent(event.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isPending}>
                {isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                Agregar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
