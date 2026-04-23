#!/usr/bin/env bash
# deploy-preview.sh — déploie la preview Helvètia Intérim sur Cloud Run.
#
# Prérequis (gérés manuellement par la session Claude, PAS automatiquement
# exécutés par ce script — le script est plutôt une checklist reproductible) :
#
#   1. Projet GCP `arnaudguedou` actif (gcloud config set project arnaudguedou)
#   2. APIs activées : run, sqladmin, artifactregistry, cloudbuild
#   3. Artifact Registry repo `interim-preview` créé dans europe-west1
#   4. Cloud SQL instance `interim-preview-pg` en état RUNNABLE
#   5. 4 images locales buildées et prêtes à push :
#      - europe-west1-docker.pkg.dev/arnaudguedou/interim-preview/api:preview
#      - europe-west1-docker.pkg.dev/arnaudguedou/interim-preview/mock-moveplanner:preview
#      - europe-west1-docker.pkg.dev/arnaudguedou/interim-preview/web-admin:preview
#      - europe-west1-docker.pkg.dev/arnaudguedou/interim-preview/web-portal:preview
#
# Ordre d'exécution :
#   1. Push 4 images → Artifact Registry
#   2. Créer DB `interim_dev` + user `interim_app` sur Cloud SQL
#   3. Run migrations + seed via Cloud SQL Proxy + prisma
#   4. Deploy 4 services Cloud Run (API sans auth publique, frontend idem pour preview)
#   5. Configurer les env vars cross-service (NEXT_PUBLIC_API_BASE_URL, etc.)
#   6. Verify /health + UI publique

set -euo pipefail

PROJECT="arnaudguedou"
REGION="europe-west1"
REGISTRY="europe-west1-docker.pkg.dev/${PROJECT}/interim-preview"
SQL_INSTANCE="interim-preview-pg"
DB_NAME="interim_dev"
DB_USER="interim_app"

# ---------- 1. Push images ----------
echo "[1/6] Push 4 images → Artifact Registry"
docker push "${REGISTRY}/api:preview"
docker push "${REGISTRY}/mock-moveplanner:preview"
docker push "${REGISTRY}/web-admin:preview"
docker push "${REGISTRY}/web-portal:preview"

# ---------- 2. Cloud SQL : DB + user ----------
echo "[2/6] Créer DB + user sur Cloud SQL"
# Password généré une fois, stocké dans gcloud secret manager idéalement.
# Pour preview on l'injecte direct. Change en prod.
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 24)}"
echo "DB_PASSWORD=${DB_PASSWORD}"  # À sauver — nécessaire pour les deploys Cloud Run

gcloud sql databases create "${DB_NAME}" \
  --instance="${SQL_INSTANCE}" \
  --project="${PROJECT}" \
  --charset=UTF8 \
  --collation=en_US.UTF8 || echo "DB déjà existante, skip"

gcloud sql users create "${DB_USER}" \
  --instance="${SQL_INSTANCE}" \
  --password="${DB_PASSWORD}" \
  --project="${PROJECT}" || echo "User déjà existant, skip"

# ---------- 3. Migrations + seed via Cloud SQL Proxy ----------
echo "[3/6] Migrations + seed Prisma via Cloud SQL Auth Proxy"
# Télécharger le proxy si absent
if ! [ -f /tmp/cloud-sql-proxy ]; then
  curl -sSfLo /tmp/cloud-sql-proxy \
    https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.11.0/cloud-sql-proxy.linux.amd64
  chmod +x /tmp/cloud-sql-proxy
fi

CONNECTION_NAME=$(gcloud sql instances describe "${SQL_INSTANCE}" \
  --project="${PROJECT}" --format="value(connectionName)")

# Lance le proxy en background, attendre qu'il écoute, puis run prisma
/tmp/cloud-sql-proxy --port=5433 "${CONNECTION_NAME}" &
PROXY_PID=$!
sleep 5

trap 'kill $PROXY_PID 2>/dev/null || true' EXIT

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5433/${DB_NAME}?schema=public" \
  pnpm -F @interim/api prisma:migrate:deploy

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5433/${DB_NAME}?schema=public" \
  pnpm -F @interim/api prisma:seed

kill $PROXY_PID 2>/dev/null || true
trap - EXIT

# ---------- 4. Deploy Cloud Run ----------
echo "[4/6] Deploy mock-moveplanner (backend frontend-less, juste pour l'API)"
gcloud run deploy interim-preview-mock-moveplanner \
  --image="${REGISTRY}/mock-moveplanner:preview" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=3030 \
  --memory=256Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=1

MP_URL=$(gcloud run services describe interim-preview-mock-moveplanner \
  --region="${REGION}" --project="${PROJECT}" --format="value(status.url)")

echo "[5/6] Deploy API (avec connexion Cloud SQL et MP URL)"
gcloud run deploy interim-preview-api \
  --image="${REGISTRY}/api:preview" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --platform=managed \
  --allow-unauthenticated \
  --add-cloudsql-instances="${CONNECTION_NAME}" \
  --port=3000 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=2 \
  --set-env-vars="NODE_ENV=production,AUTH_MODE=dev,MOVEPLANNER_BASE_URL=${MP_URL},DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${CONNECTION_NAME}&schema=public"

API_URL=$(gcloud run services describe interim-preview-api \
  --region="${REGION}" --project="${PROJECT}" --format="value(status.url)")

echo "[6/6] Deploy web-admin + web-portal avec NEXT_PUBLIC_API_BASE_URL=${API_URL}"
gcloud run deploy interim-preview-web-admin \
  --image="${REGISTRY}/web-admin:preview" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=2 \
  --set-env-vars="NODE_ENV=production,NEXT_PUBLIC_API_BASE_URL=${API_URL}"

gcloud run deploy interim-preview-web-portal \
  --image="${REGISTRY}/web-portal:preview" \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=2 \
  --set-env-vars="NODE_ENV=production,NEXT_PUBLIC_API_BASE_URL=${API_URL}"

ADMIN_URL=$(gcloud run services describe interim-preview-web-admin \
  --region="${REGION}" --project="${PROJECT}" --format="value(status.url)")
PORTAL_URL=$(gcloud run services describe interim-preview-web-portal \
  --region="${REGION}" --project="${PROJECT}" --format="value(status.url)")

echo "============================================================="
echo "✅ Preview deployed"
echo "   API:        ${API_URL}"
echo "   web-admin:  ${ADMIN_URL}"
echo "   web-portal: ${PORTAL_URL}"
echo "   mock-MP:    ${MP_URL}"
echo "============================================================="
echo "Test : curl -H 'Authorization: Bearer dev' ${API_URL}/api/v1/workers"
