import { SparklesIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAuthConfigured } from "@/lib/env";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="glow-primary flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <SparklesIcon className="size-6" />
          </span>
          <h1 className="text-gradient font-heading text-2xl font-bold tracking-tight">
            Social Estudio
          </h1>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-lg">Iniciar sesión</CardTitle>
            <CardDescription>
              {isAuthConfigured
                ? "Inicia sesión para acceder a tus perfiles y guiones."
                : "Falta configurar la aplicación"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAuthConfigured ? (
              <LoginForm />
            ) : (
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <p>
                  Crea un archivo <code className="font-mono">.env</code> y rellena:
                </p>
                <pre className="rounded-lg border border-border/60 bg-muted/50 p-3 font-mono text-xs">
                  DATABASE_URL{"\n"}
                  BETTER_AUTH_SECRET{"\n"}
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
      </div>
    </main>
  );
}
