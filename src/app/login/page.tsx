import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Social Estudio</CardTitle>
          <CardDescription>
            {isSupabaseConfigured
              ? "Inicia sesión para acceder a tus perfiles y guiones."
              : "Falta conectar Supabase"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSupabaseConfigured ? (
            <LoginForm />
          ) : (
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>Crea un archivo <code className="font-mono">.env.local</code> y rellena:</p>
              <pre className="rounded-lg bg-muted p-3 font-mono text-xs">
                NEXT_PUBLIC_SUPABASE_URL{"\n"}
                NEXT_PUBLIC_SUPABASE_ANON_KEY{"\n"}
                API_KEY_ENCRYPTION_SECRET
              </pre>
              <p>
                Tienes todos los pasos en el <code className="font-mono">README.md</code> del
                proyecto.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
