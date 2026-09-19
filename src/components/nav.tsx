"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HistoryIcon,
  LogOutIcon,
  MessagesSquareIcon,
  SettingsIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";

import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Chat", icon: MessagesSquareIcon },
  { href: "/perfiles", label: "Perfiles", icon: UsersIcon },
  { href: "/ajustes", label: "Ajustes", icon: SettingsIcon },
  { href: "/historial", label: "Historial", icon: HistoryIcon },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="glow-primary flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform group-hover:scale-105">
            <SparklesIcon className="size-4" />
          </span>
          <span className="text-gradient font-heading text-base font-bold tracking-tight">
            Social Estudio
          </span>
        </Link>

        <nav className="flex items-center gap-1 rounded-full border border-border/60 bg-card/50 p-1">
          {LINKS.map((link) => {
            const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <form action={signOut} className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            type="submit"
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <LogOutIcon />
            <span className="hidden sm:inline">Salir</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
