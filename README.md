# Social Estudio

Generador de guiones y prompts de imagen para redes sociales con IA.

- **Chat** con streaming y selección de proveedor/modelo (OpenAI, Anthropic, Google/Gemini, DeepSeek, OpenRouter).
- **Proveedores personalizados** compatibles con la API de OpenAI (URL base propia) y **modelos manuales** por si el listado automático no los devuelve.
- **Perfiles** con instrucciones personalizadas de estilo de guion y de temas (ej. estilo bíblico).
- **Prompts de imagen** generados a partir del guion usando tus instrucciones de estilo.
- **Guiones**: crea guiones **a mano** o guárdalos desde el chat; ver, **editar**, copiar/descargar y generar voz.
- **Voz de los guiones** con [Vibi](https://vibi.pro) (ElevenLabs, MiniMax y CapCut): genera, reproduce y descarga la locución de cada guion.
- **API keys** guardadas cifradas (AES-256-GCM) en la base de datos.
- Login de usuario único o de pocos usuarios (Better Auth, email + contraseña).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui
- **SQLite** + [Prisma](https://www.prisma.io) (base de datos local, sin servidor)
- **Better Auth** (sesiones por cookie, email/contraseña)
- Vercel AI SDK v7 (`ai`)

## Requisitos

- Node.js 20.9+ (probado con 24)

No necesitas Supabase ni ningún servicio externo: la base de datos es un archivo
SQLite local.

## Configuración local

### 1. Variables de entorno

Crea el archivo `.env` (o copia `.env.example`):

```bash
cp .env.example .env
```

Genera los secretos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Rellena `.env`:

```env
DATABASE_URL="file:../data/app.db"
BETTER_AUTH_SECRET=el-secreto-que-generaste
BETTER_AUTH_URL=http://localhost:3000
API_KEY_ENCRYPTION_SECRET=otro-secreto-que-generaste
```

- `BETTER_AUTH_SECRET` firma las sesiones de Better Auth.
- `API_KEY_ENCRYPTION_SECRET` cifra las API keys de IA antes de guardarlas. Si lo
  cambias, las claves guardadas dejarán de poder descifrarse.
- `DATABASE_URL` apunta al archivo SQLite. La ruta es relativa a `prisma/`.

### 2. Base de datos y usuario

```bash
npm install
npx prisma migrate deploy        # crea data/app.db con el esquema
npm run create-user -- --email tu@email.com --password "tu-clave-segura" --name "Tu nombre"
```

El registro público está desactivado: las cuentas se crean con `create-user`.

### 3. Ejecutar

```bash
npm run dev
```

Abre http://localhost:3000, inicia sesión y entra en **Ajustes** para guardar tu
primera API key.

## Uso

1. **Ajustes** → pega tus API keys (OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter y AIRAI) y
   elige el proveedor y modelo por defecto. También puedes **agregar proveedores
   personalizados** (cualquier endpoint compatible con OpenAI) y **modelos manuales**.
   Guarda también tu **clave de Vibi** para generar la voz de los guiones.
2. **Perfiles** → crea perfiles con sus instrucciones: estilo de guion, temas y **prompts de
   imagen** (aquí defines, por ejemplo, cuántas escenas quieres y el estilo visual).
3. **Chat** → elige perfil, proveedor y modelo; pide un tema y el guion se genera en streaming.
4. Pulsa **Generar prompts de imagen** y los prompts aparecerán **como un mensaje más del chat**,
   usando las instrucciones de prompts de imagen del perfil activo (número de escenas y estilo).
   Puedes copiarlos desde el propio mensaje.
5. **Guardar en Guiones** guarda el último mensaje del asistente en **Guiones**, donde puedes
   verlo, **editarlo** (título y contenido), copiarlo o eliminarlo.
6. **Guiones → Generar voz** convierte un guion guardado en audio con Vibi (elige proveedor,
   voz, idioma y modelo). El audio se reproduce y se puede descargar desde la misma tarjeta.

## Base de datos y migraciones

El esquema vive en `prisma/schema.prisma` y las migraciones en `prisma/migrations/`.

```bash
npm run db:migrate       # aplica migraciones pendientes (producción)
npm run db:migrate:dev   # crea una migración nueva en desarrollo
npm run db:generate      # regenera el cliente de Prisma
npm run create-user      # crea una cuenta de usuario
```

## Despliegue en un VPS (Node + systemd)

1. Copia el proyecto al servidor (por ejemplo en `/opt/social-estudio`) y crea el
   archivo `.env` con `DATABASE_URL="file:../data/app.db"`,
   `BETTER_AUTH_URL=https://tu-dominio.com`, `BETTER_AUTH_SECRET` y
   `API_KEY_ENCRYPTION_SECRET`.
2. Instala y compila:

   ```bash
   bash scripts/deploy.sh
   ```

3. Crea el usuario del sistema y el servicio:

   ```bash
   sudo useradd --system --home /opt/social-estudio --shell /usr/sbin/nologin socialestudio
   sudo chown -R socialestudio:socialestudio /opt/social-estudio
   sudo cp deploy/social-estudio.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now social-estudio
   ```

4. Configura tu reverse proxy (Caddy/Nginx) para que `https://tu-dominio.com`
   apunte a `http://127.0.0.1:3000`.

El archivo SQLite se guarda en `data/`. **Haz copias de seguridad de `data/app.db`**
(con la app parada o mediante `sqlite3 data/app.db ".backup backup.db"`).

## Estructura relevante

```
src/
  app/
    (app)/              # Chat, Perfiles, Ajustes, Guiones (rutas protegidas)
    api/chat/           # Streaming de chat y prompts de imagen (AI SDK)
    api/auth/           # Handler de Better Auth
    api/models/         # Listado de modelos por proveedor
    actions/            # Server Actions (CRUD y auth)
  lib/
    auth.ts             # Instancia de Better Auth
    session.ts          # getCurrentUser (sesión en el servidor)
    db.ts               # Cliente de Prisma
    data/               # Acceso a datos
    ai/                 # Resolución de modelos por proveedor
  proxy.ts              # Protección de rutas
prisma/schema.prisma    # Esquema de la base de datos
prisma/migrations/      # Migraciones
scripts/create-user.ts  # Alta manual de usuarios
deploy/                 # Unidad systemd
```

## Comandos

```bash
npm run dev          # desarrollo
npm run build        # build de producción
npm run start        # servir el build
npm run lint         # ESLint
npm run create-user  # crear un usuario
npm run db:migrate   # aplicar migraciones
```
