#!/usr/bin/env bash
# Despliegue en el VPS. Ejecutar desde la raíz del proyecto:
#   bash scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Instalando dependencias"
npm ci

echo "==> Generando el cliente de Prisma"
npx prisma generate

echo "==> Aplicando migraciones"
npx prisma migrate deploy

echo "==> Compilando la app"
npm run build

echo "==> Listo. Reinicia el servicio: sudo systemctl restart social-estudio"
