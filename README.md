# Social Estudio

Generador de guiones y prompts de imagen para redes sociales con IA.

- **Chat** con streaming y selección de proveedor/modelo (OpenAI, Anthropic, Google/Gemini, DeepSeek, OpenRouter).
- **Perfiles** con instrucciones personalizadas de estilo de guion y de temas (ej. estilo bíblico).
- **Prompts de imagen** generados a partir del guion usando tus instrucciones de estilo.
- **Historial** de guiones guardados, con copiar/descargar.
- **API keys** guardadas cifradas (AES-256-GCM) en la base de datos.
- Login de usuario único (Supabase Auth).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui
- Supabase (Postgres + Auth + Row Level Security)
- Vercel AI SDK v7 (`ai`)

## Requisitos

- Node.js 20.9+ (probado con 24)
- Cuenta en [supabase.com](https://supabase.com) (plan gratis suficiente)

## Configuración local

### 1. Crear el proyecto en Supabase

1. Entra en [supabase.com](https://supabase.com) y crea un proyecto nuevo.
2. Copia de **Project Settings → API**:
   - `Project URL`
   - `anon public key`
3. Abre el **SQL Editor** y pega el contenido de `supabase/schema.sql`. Ejecútalo.
4. En **Authentication → Providers**, deja activo *Email* y **desactiva** *Allow new users to sign up* (solo habrá tu cuenta).
5. En **Authentication → Users**, haz clic en *Add user* y crea tu email y contraseña.

### 2. Variables de entorno

Crea el archivo `.env.local` en la raíz del proyecto (o copia `.env.example`):

```bash
cp .env.example .env.local
```

Rellena:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key

# Genera uno con:
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
API_KEY_ENCRYPTION_SECRET=un-secreto-largo-y-aleatorio
```

`API_KEY_ENCRYPTION_SECRET` cifra las API keys de IA antes de guardarlas. Si lo cambias,
las claves guardadas dejarán de poder descifrarse.

### 3. Instalar y ejecutar

```bash
npm install
npm run dev
```

Abre http://localhost:3000, inicia sesión con tu usuario de Supabase y entra en **Ajustes**
para guardar tu primera API key.

## Uso

1. **Ajustes** → pega tus API keys (OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter y AIRAI) y
   elige el proveedor y modelo por defecto.
2. **Perfiles** → crea perfiles con sus instrucciones: estilo de guion, temas y **prompts de
   imagen** (aquí defines, por ejemplo, cuántas escenas quieres y el estilo visual).
3. **Chat** → elige perfil, proveedor y modelo; pide un tema y el guion se genera en streaming.
4. Pulsa **Generar prompts** para obtener los prompts de imagen del guion usando las
   instrucciones del perfil activo, y **Guardar guion** para guardarlo en el **Historial**.

## Migraciones de base de datos

- `supabase/schema.sql` → esquema completo para un proyecto nuevo.
- `supabase/migrations/` → cambios incrementales para bases de datos ya creadas. Pega cada
  archivo en el SQL Editor de Supabase en orden.

Migraciones disponibles:

- `0002_profile_image_instructions.sql` → mueve las instrucciones de prompts de imagen de
  `settings` (global) a `profiles` (una por perfil) y conserva lo que ya tenías.

## Despliegue en Vercel

1. Sube el proyecto a GitHub (repositorio privado).
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repositorio.
3. Framework: **Next.js** (detección automática).
4. Añade las mismas variables de entorno del paso 2 y despliega.
5. En Supabase → **Authentication → URL Configuration**, añade la URL de tu deployment a
   *Site URL* y añade `http://localhost:3000` a *Redirect URLs*.

## Estructura relevante

```
src/
  app/
    (app)/              # Chat, Perfiles, Ajustes, Historial (rutas protegidas)
    api/chat/           # Streaming de chat (AI SDK)
    api/image-prompts/  # Generación de prompts de imagen
    login/              # Inicio de sesión
    actions/            # Server Actions (CRUD y auth)
  lib/
    supabase/           # Clientes de Supabase (cliente, servidor, proxy)
    ai/                 # Resolución de modelos por proveedor
    data/               # Acceso a datos
  proxy.ts              # Refresco de sesión y protección de rutas
supabase/schema.sql     # Esquema de la base de datos + RLS
supabase/migrations/    # Migraciones incrementales
```

## Comandos

```bash
npm run dev       # desarrollo
npm run build     # build de producción
npm run start     # servir el build
npm run lint      # ESLint
```
