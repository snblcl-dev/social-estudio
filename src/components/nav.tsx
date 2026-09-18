"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HistoryIcon, LogOutIcon, MessagesSquareIcon, SettingsIcon, UsersIcon } from "lucide-react";

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
    <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="font-heading text-sm font-semibold tracking-tight">
          Social Estudio
        </Link>

        <nav className="flex items-center gap-0.5">
          {LINKS.map((link) => {
            const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            const Icon = link.icon;

            return (
              <Button
                key={link.href}
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                nativeButton={false}
                render={<Link href={link.href} />}
                className={cn(!isActive && "text-muted-foreground")}
              >
                <Icon />
                <span className="hidden sm:inline">{link.label}</span>
              </Button>
            );
          })}
        </nav>

        <form action={signOut} className="ml-auto">
          <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground">
            <LogOutIcon />
            <span className="hidden sm:inline">Salir</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
