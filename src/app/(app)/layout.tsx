import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { Nav } from "@/components/nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Falta conectar Supabase</CardTitle>
            <CardDescription>
              Rellena el archivo <code className="font-mono">.env.local</code> con tus
              credenciales y reinicia el servidor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="rounded-lg border border-border/60 bg-muted/50 p-3 font-mono text-xs">
              NEXT_PUBLIC_SUPABASE_URL{"\n"}
              NEXT_PUBLIC_SUPABASE_ANON_KEY{"\n"}
              API_KEY_ENCRYPTION_SECRET
            </pre>
          </CardContent>
        </Card>
      </main>
    );
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Nav />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
