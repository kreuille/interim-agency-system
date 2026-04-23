# Runbook — déploiement preview GCP (non-prod)

> **Usage** : environnement de démo cliquable pour tester l'app full-stack en conditions proches prod (Cloud Run + Cloud SQL) sans provisioning nLPD complet (A0.4).
> **⚠️ JAMAIS en prod** : pas de CMEK, pas de Swiss residency, auth bypassée (`AUTH_MODE=dev`), pas de DPO sign-off.
> **Coût estimé** : ~8-10 CHF/mois (Cloud SQL f1-micro zonal 24/7, Cloud Run free tier).

---

## 0. Quand utiliser ce runbook

- 🟢 Démo cliquable pour une équipe produit / design / parties prenantes
- 🟢 Valider que la stack builds + boot end-to-end en conditions Cloud Run avant A0.4 prod
- 🟢 Tests d'intégration manuels avant un go-live

**NE PAS utiliser pour** :
- ❌ Données client réelles (pas nLPD-compliant — pas de CMEK, pas Swiss residency)
- ❌ Mesures de perf réalistes (f1-micro + min-instances=0 = cold starts)
- ❌ Gateway MovePlanner réel (on utilise le mock, pas l'API prod Moveplanner)

---

## 1. Architecture

```
                         Cloud Run (europe-west1)
    ┌────────────────────────────────────────────────────────┐
    │  web-admin                      web-portal             │
    │  (Next.js 14 standalone)       (Next.js 14 standalone) │
    │  port 3000                      port 3000              │
    └──────────────┬────────────────────────────────────────┘
                   │
                   │ NEXT_PUBLIC_API_BASE_URL
                   ▼
    ┌────────────────────────────────────────────────────────┐
    │  api                            mock-moveplanner       │
    │  (Express + Prisma)             (tsx stub)             │
    │  port 3000                      port 3030              │
    │  AUTH_MODE=dev                                         │
    └──────────────┬────────────────────────────────────────┘
                   │
                   │ DATABASE_URL=...?host=/cloudsql/<CONN>
                   ▼
    ┌────────────────────────────────────────────────────────┐
    │  Cloud SQL Postgres 16 f1-micro zonal                  │
    │  interim-preview-pg (Enterprise edition)               │
    │  DB `interim_dev`, user `interim_app`                  │
    └────────────────────────────────────────────────────────┘
```

Images Docker dans **Artifact Registry** `europe-west1-docker.pkg.dev/<project>/interim-preview/`.

---

## 2. Prérequis locaux

- `gcloud` CLI authentifié (`gcloud auth list` → compte actif)
- `docker` installé et démarré (Docker Desktop sur Windows)
- Accès au projet GCP cible + billing account rattaché
- Node 20 + pnpm 9 (pour les migrations Prisma)

## 3. Provisioning initial (à faire 1 fois)

### 3.1 Créer / sélectionner le projet GCP

```bash
# Option A : créer un projet dédié (si quota le permet)
gcloud projects create interim-preview-$(date +%Y%m%d) --name="Helvetia Interim Preview"
gcloud billing projects link interim-preview-YYYYMMDD --billing-account=<BILLING_ACCOUNT_ID>

# Option B : réutiliser un projet existant avec préfixes `interim-preview-*`
gcloud config set project <EXISTING_PROJECT>
```

### 3.2 Activer les APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  sql-component.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

### 3.3 Artifact Registry (gratuit jusqu'à 500 MB)

```bash
gcloud artifacts repositories create interim-preview \
  --repository-format=docker \
  --location=europe-west1 \
  --description="Helvetia Interim preview container images"

gcloud auth configure-docker europe-west1-docker.pkg.dev --quiet
```

### 3.4 Cloud SQL (~7 CHF/mois)

```bash
# f1-micro EXIGE edition=enterprise (pas enterprise-plus)
gcloud sql instances create interim-preview-pg \
  --database-version=POSTGRES_16 \
  --region=europe-west1 \
  --tier=db-f1-micro \
  --edition=enterprise \
  --storage-size=10 \
  --storage-type=HDD \
  --root-password="$(openssl rand -base64 24)" \
  --no-storage-auto-increase \
  --availability-type=zonal
```

**⏱️** compte ~5-10 min de provisioning.

### 3.5 Créer DB + user applicatif

```bash
DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
echo "SAVE THIS PASSWORD: $DB_PASSWORD"

gcloud sql databases create interim_dev \
  --instance=interim-preview-pg \
  --charset=UTF8 \
  --collation=en_US.UTF8

gcloud sql users create interim_app \
  --instance=interim-preview-pg \
  --password="$DB_PASSWORD"
```

**À savoir** : sauvegarder le password dans un gestionnaire (1Password / Secret Manager). Requis pour les `gcloud run deploy` suivants.

---

## 4. Build + push images

### 4.1 Build en local (4 images en parallèle)

```bash
cd <repo-root>
REGISTRY="europe-west1-docker.pkg.dev/<PROJECT>/interim-preview"

docker build -f ./apps/api/Dockerfile -t "${REGISTRY}/api:preview" .
docker build -t "${REGISTRY}/mock-moveplanner:preview" ./apps/mock-moveplanner
docker build -f ./apps/web-admin/Dockerfile -t "${REGISTRY}/web-admin:preview" .
docker build -f ./apps/web-portal/Dockerfile -t "${REGISTRY}/web-portal:preview" .
```

**Les Dockerfiles Next.js** (web-admin/web-portal) utilisent `output: 'standalone'` (cf. `apps/*/next.config.mjs`) + `outputFileTracingRoot` à la racine du monorepo pour résoudre les workspace deps (`@interim/domain`, `@interim/shared`).

### 4.2 Push

```bash
for img in api mock-moveplanner web-admin web-portal; do
  docker push "${REGISTRY}/${img}:preview"
done
```

---

## 5. Migrations + seed (1 fois après chaque reset DB)

Cloud SQL par défaut est en IP publique (pas de VPC privé en preview). Deux options :

### 5.1 Option A — IP autorisée temporaire (simple)

```bash
MY_IP=$(curl -s https://api.ipify.org)
gcloud sql instances patch interim-preview-pg \
  --authorized-networks=${MY_IP}/32 --quiet

DB_PUBLIC_IP=$(gcloud sql instances describe interim-preview-pg \
  --format="value(ipAddresses[0].ipAddress)")

DATABASE_URL="postgresql://interim_app:${DB_PASSWORD}@${DB_PUBLIC_IP}:5432/interim_dev?schema=public&sslmode=require" \
  pnpm -F @interim/api prisma:migrate:deploy

DATABASE_URL="postgresql://interim_app:${DB_PASSWORD}@${DB_PUBLIC_IP}:5432/interim_dev?schema=public&sslmode=require" \
  pnpm -F @interim/api prisma:seed

# Retirer l'IP quand on a fini
gcloud sql instances patch interim-preview-pg --clear-authorized-networks --quiet
```

### 5.2 Option B — Cloud SQL Auth Proxy (recommandé staging+)

Nécessite ADC (`gcloud auth application-default login`) fonctionnel. Sur Windows Git Bash cela peut cracher — dans ce cas utiliser l'Option A.

```bash
docker run -d --name interim-sql-proxy \
  -v "$HOME/.config/gcloud:/root/.config/gcloud:ro" \
  -p 5433:5432 \
  gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.11.0 \
  --address 0.0.0.0 --port 5432 \
  <PROJECT>:europe-west1:interim-preview-pg
```

Puis `DATABASE_URL=postgresql://interim_app:${DB_PASSWORD}@localhost:5433/interim_dev` pour les prisma commands.

---

## 6. Deploy Cloud Run (ordre matters : mock-MP → API → frontend)

### 6.1 mock-moveplanner (d'abord, pour obtenir son URL)

```bash
gcloud run deploy interim-preview-mock-mp \
  --image="${REGISTRY}/mock-moveplanner:preview" \
  --region=europe-west1 \
  --platform=managed \
  --allow-unauthenticated \
  --port=3030 \
  --memory=256Mi --cpu=1 \
  --min-instances=0 --max-instances=1 \
  --quiet

MP_URL=$(gcloud run services describe interim-preview-mock-mp \
  --region=europe-west1 --format="value(status.url)")
```

### 6.2 API (avec Cloud SQL socket + MP URL)

Template env file (placé dans `ops/preview-api-env.yaml` — committé) :

```yaml
NODE_ENV: production
AUTH_MODE: dev
MOVEPLANNER_BASE_URL: REPLACE_MP_URL
DATABASE_URL: postgresql://interim_app:REPLACE_DB_PASSWORD@localhost/interim_dev?host=/cloudsql/REPLACE_CLOUD_SQL_CONN&schema=public
```

Faire une copie `.local.yaml` (gitignorée) avec les vraies valeurs, puis :

```bash
CONN=$(gcloud sql instances describe interim-preview-pg --format="value(connectionName)")

gcloud run deploy interim-preview-api \
  --image="${REGISTRY}/api:preview" \
  --region=europe-west1 \
  --platform=managed \
  --allow-unauthenticated \
  --add-cloudsql-instances="${CONN}" \
  --port=3000 \
  --memory=512Mi --cpu=1 \
  --min-instances=0 --max-instances=2 \
  --env-vars-file=ops/preview-api-env.local.yaml \
  --quiet

API_URL=$(gcloud run services describe interim-preview-api \
  --region=europe-west1 --format="value(status.url)")
```

### 6.3 web-admin + web-portal (avec NEXT_PUBLIC_API_BASE_URL)

```bash
for app in web-admin web-portal; do
  gcloud run deploy interim-preview-${app} \
    --image="${REGISTRY}/${app}:preview" \
    --region=europe-west1 \
    --platform=managed \
    --allow-unauthenticated \
    --port=3000 \
    --memory=512Mi --cpu=1 \
    --min-instances=0 --max-instances=2 \
    --set-env-vars="NODE_ENV=production,NEXT_PUBLIC_API_BASE_URL=${API_URL}" \
    --quiet
done
```

**⚠️ Note** : les `NEXT_PUBLIC_*` ne sont vus qu'à **runtime côté server components**. Les client components lisent la valeur build-time (actuellement `undefined` → fallback `http://localhost:3000`). En l'état, les appels API depuis les server components fonctionnent ; les client components qui passeraient par cette URL nécessiteraient un rebuild de l'image.

---

## 7. Vérifier end-to-end

```bash
API_URL=$(gcloud run services describe interim-preview-api --region=europe-west1 --format="value(status.url)")

# Health
curl -f "${API_URL}/health"
# → {"status":"ok",...}

# Routes métier (Bearer = n'importe quoi car AUTH_MODE=dev)
curl -H "Authorization: Bearer test" "${API_URL}/api/v1/workers" | jq .items
# → [Jean Dupont, Marie Martin] (seed)

# Back-office (navigateur)
gcloud run services describe interim-preview-web-admin --region=europe-west1 --format="value(status.url)"
# → https://interim-preview-web-admin-XXXXX.europe-west1.run.app
```

---

## 8. Killer la preview

```bash
PROJECT=<PROJECT_ID>

# Services Cloud Run (gratuits idle, mais évite des cold starts inutiles)
for svc in mock-mp api web-admin web-portal; do
  gcloud run services delete interim-preview-${svc} --region=europe-west1 --project=${PROJECT} --quiet
done

# Cloud SQL — CRITIQUE : c'est ce qui coûte tous les jours
gcloud sql instances delete interim-preview-pg --project=${PROJECT} --quiet

# Artifact Registry
gcloud artifacts repositories delete interim-preview --location=europe-west1 --project=${PROJECT} --quiet
```

**Pour mettre en pause sans détruire** (utile si on veut redémarrer plus tard) :
```bash
# Arrête Cloud SQL (économie ~7 CHF/mois, reprend là où on est en la réactivant)
gcloud sql instances patch interim-preview-pg --activation-policy=NEVER --project=${PROJECT}
```

---

## 9. Pièges rencontrés & solutions

| Erreur | Cause | Solution |
|---|---|---|
| `Invalid Tier (db-f1-micro) for (ENTERPRISE_PLUS) Edition` | Cloud SQL default = Enterprise Plus qui refuse les shared-core | Ajouter `--edition=enterprise` |
| `Aborted by user` pendant `gcloud run deploy` | API `sql-component.googleapis.com` pas activée, prompt interactif refusé par `--quiet` | Activer l'API explicitement au §3.2 |
| Build Next.js : `Can't resolve 'cluster' / 'v8' / 'perf_hooks'` | `packages/shared/src/index.ts` re-exporte `prom-registry` (Node-only) ; un client component importe depuis `@interim/shared` → webpack tente de bundler prom-client pour le browser | Étendre `resolve.fallback` dans `apps/web-admin/next.config.mjs` : `cluster: false, v8: false, perf_hooks: false, ...` |
| Build Next.js : `Can't resolve '../lib/session.js'` | Convention NodeNext `.js` en imports TS pas résolue par défaut | `resolve.extensionAlias: { '.js': ['.ts', '.tsx', '.js'] }` dans `next.config.mjs` |
| Dockerfile `COPY ... public: not found` | `apps/web-admin` n'a pas de dossier `public/` versionné | `RUN mkdir -p apps/web-admin/public` avant le build dans le Dockerfile |
| Cloud SQL Auth Proxy ADC error sur Windows | `~/.config/gcloud` n'existe pas — gcloud sur Windows est dans `%APPDATA%\gcloud` | Mounter `/c/Users/<you>/AppData/Roaming/gcloud:/root/.config/gcloud:ro`, ou fallback sur Option A (IP autorisée) |

---

## 10. Références

- Architecture cible prod (différente de preview) : `docs/adr/0002-hosting-ch.md`
- Wiring DI de l'API : `apps/api/src/main.ts` — `buildDeps()` + `buildTokenVerifier()`
- DevTokenVerifier (AUTH_MODE=dev) : `apps/api/src/infrastructure/auth/dev-token-verifier.ts`
- Next.js standalone : https://nextjs.org/docs/app/api-reference/next-config-js/output
- Cloud Run + Cloud SQL : https://cloud.google.com/sql/docs/postgres/connect-run
