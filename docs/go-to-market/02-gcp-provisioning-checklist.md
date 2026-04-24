# GCP — Provisioning checklist (A0.4 / DETTE-015)

> **Objectif** : provisionner l'infra Google Cloud `europe-west6` (Zurich) pour staging + prod selon ADR-0002.
> **Délai réaliste** : 1-2 jours en solo (si expérience gcloud) ; 2-3 jours avec freelance devops.
> **Coût** : setup ~100 CHF, run de base 300-600 CHF/mois après.
> **Responsable** : fondateur (compte + facturation) + devops (provisioning technique).

---

## 1. Pré-requis avant de commencer

- [ ] Domaine `monagence.ch` ou équivalent acquis (ex. via Infomaniak).
- [ ] Email pro `fondateur@monagence.ch` (pas un gmail).
- [ ] Carte de crédit d'entreprise.
- [ ] 2FA actif sur ton compte Google (obligatoire pour GCP billing).
- [ ] `gcloud` CLI installé localement (`brew install google-cloud-sdk` ou équivalent).

---

## 2. Création du compte et de l'organisation

### 2.1 Compte Google Cloud
1. Aller sur https://console.cloud.google.com.
2. Se connecter avec `fondateur@monagence.ch`.
3. Accepter les CGU.
4. Créer une **organisation** si pas déjà fait (à partir du domaine `monagence.ch` — nécessite la délégation DNS vers Google Workspace OU validation TXT). Si trop complexe, on reste sur un compte personnel pour démarrer — **à migrer plus tard**.

### 2.2 Billing account
1. Créer un **compte de facturation** : nom "Agence Intérim SA", adresse du siège, TVA suisse, IBAN pour paiement SEPA.
2. Lier la carte de crédit.
3. Activer les **alertes de facturation** : seuils 200 CHF (info), 500 CHF (warning), 1'000 CHF (critical).

### 2.3 DPA Google Cloud Switzerland GmbH
1. Dans la console, aller dans **IAM & Admin → Settings → Data Processing and Security Terms**.
2. Accepter le **Cloud Data Processing Addendum**.
3. **Important** : spécifier comme entité contractante **Google Cloud Switzerland GmbH** (Gustav-Gull-Platz 1, 8004 Zürich) — c'est le signataire qui garantit que les données restent en Suisse.
4. Télécharger le PDF signé pour archive `docs/compliance/dpa-gcp-switzerland.pdf`.

---

## 3. Projets

Créer deux projets distincts pour séparer staging et prod.

```bash
# Projet staging
gcloud projects create interim-agency-staging \
  --name="Agence Intérim — Staging" \
  --organization=ORG_ID_IF_ANY

# Projet prod
gcloud projects create interim-agency-prod \
  --name="Agence Intérim — Production" \
  --organization=ORG_ID_IF_ANY

# Lier au compte de facturation
gcloud billing projects link interim-agency-staging --billing-account=BILLING_ACCOUNT_ID
gcloud billing projects link interim-agency-prod --billing-account=BILLING_ACCOUNT_ID
```

---

## 4. Activation des APIs

Pour chaque projet (staging puis prod) :

```bash
gcloud config set project interim-agency-staging

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudkms.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  cloudtrace.googleapis.com \
  compute.googleapis.com \
  servicenetworking.googleapis.com
```

Répéter pour `interim-agency-prod`.

---

## 5. Région et zone

Tout en `europe-west6` (Zurich). Vérifier régulièrement que les services utilisés le supportent — c'est le cas pour Cloud Run, Cloud SQL, Memorystore, Cloud Storage, Secret Manager, KMS.

```bash
gcloud config set compute/region europe-west6
gcloud config set compute/zone europe-west6-a
```

---

## 6. Cloud KMS (Customer-Managed Encryption Keys)

Créer un keyring et deux clés par projet (pour les buckets et Cloud SQL).

```bash
gcloud kms keyrings create interim-cmek \
  --location=europe-west6

gcloud kms keys create docs-encryption-key \
  --keyring=interim-cmek \
  --location=europe-west6 \
  --purpose=encryption \
  --rotation-period=90d \
  --next-rotation-time=$(date -d "+90 days" -u +%Y-%m-%dT%H:%M:%SZ)

gcloud kms keys create sql-encryption-key \
  --keyring=interim-cmek \
  --location=europe-west6 \
  --purpose=encryption \
  --rotation-period=90d \
  --next-rotation-time=$(date -d "+90 days" -u +%Y-%m-%dT%H:%M:%SZ)
```

Accorder au service account Cloud SQL l'accès à la clé :

```bash
gcloud kms keys add-iam-policy-binding sql-encryption-key \
  --keyring=interim-cmek \
  --location=europe-west6 \
  --member=serviceAccount:service-$(gcloud projects describe $GCP_PROJECT --format='value(projectNumber)')@gcp-sa-cloud-sql.iam.gserviceaccount.com \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter
```

---

## 7. VPC (réseau privé)

Pour que Cloud Run → Cloud SQL → Memorystore communiquent en privé (pas via IP publique).

```bash
# Créer VPC custom
gcloud compute networks create interim-vpc \
  --subnet-mode=custom

# Créer sous-réseau
gcloud compute networks subnets create interim-subnet \
  --network=interim-vpc \
  --range=10.0.0.0/24 \
  --region=europe-west6

# Service connection pour Cloud SQL et Memorystore
gcloud compute addresses create google-managed-services-interim-vpc \
  --global \
  --purpose=VPC_PEERING \
  --prefix-length=16 \
  --network=interim-vpc

gcloud services vpc-peerings connect \
  --service=servicenetworking.googleapis.com \
  --ranges=google-managed-services-interim-vpc \
  --network=interim-vpc

# Serverless VPC connector pour Cloud Run
gcloud compute networks vpc-access connectors create interim-connector \
  --region=europe-west6 \
  --subnet=interim-subnet \
  --subnet-project=$GCP_PROJECT \
  --min-instances=2 --max-instances=3
```

---

## 8. Cloud SQL (PostgreSQL 16)

```bash
gcloud sql instances create interim-db \
  --database-version=POSTGRES_16 \
  --tier=db-custom-2-7680 \
  --region=europe-west6 \
  --network=projects/$GCP_PROJECT/global/networks/interim-vpc \
  --no-assign-ip \
  --storage-size=50GB \
  --storage-type=SSD \
  --storage-auto-increase \
  --backup-start-time=02:00 \
  --backup-location=europe-west6 \
  --enable-point-in-time-recovery \
  --disk-encryption-key=projects/$GCP_PROJECT/locations/europe-west6/keyRings/interim-cmek/cryptoKeys/sql-encryption-key \
  --database-flags=max_connections=200,log_connections=on,log_disconnections=on

# Créer la base de données
gcloud sql databases create interim --instance=interim-db

# Créer un utilisateur
gcloud sql users create interim_app --instance=interim-db --password=REDACTED_STRONG_PASSWORD
```

**Note** : le mot de passe doit aller dans Secret Manager, pas dans l'historique shell.

---

## 9. Memorystore Redis

```bash
gcloud redis instances create interim-redis \
  --region=europe-west6 \
  --size=1 \
  --tier=standard \
  --redis-version=redis_7_0 \
  --network=projects/$GCP_PROJECT/global/networks/interim-vpc \
  --connect-mode=private-service-access
```

---

## 10. Cloud Storage (buckets)

Un bucket par catégorie de données, tous avec CMEK.

```bash
# Bucket pour documents intérimaires (permis, diplômes, contrats)
gcloud storage buckets create gs://interim-worker-docs-$GCP_PROJECT \
  --location=europe-west6 \
  --default-encryption-key=projects/$GCP_PROJECT/locations/europe-west6/keyRings/interim-cmek/cryptoKeys/docs-encryption-key \
  --uniform-bucket-level-access \
  --soft-delete-duration=30d

# Bucket pour GED légale (contrats, bulletins, factures) avec rétention 10 ans
gcloud storage buckets create gs://interim-ged-legal-$GCP_PROJECT \
  --location=europe-west6 \
  --default-encryption-key=projects/$GCP_PROJECT/locations/europe-west6/keyRings/interim-cmek/cryptoKeys/docs-encryption-key \
  --uniform-bucket-level-access \
  --retention-period=10y

# Bucket pour backups DR
gcloud storage buckets create gs://interim-backups-$GCP_PROJECT \
  --location=europe-west6 \
  --default-encryption-key=projects/$GCP_PROJECT/locations/europe-west6/keyRings/interim-cmek/cryptoKeys/docs-encryption-key \
  --uniform-bucket-level-access
```

---

## 11. Secret Manager

Pousser les secrets initiaux. Exemple :

```bash
# Mot de passe DB
echo -n "$DB_PASSWORD" | gcloud secrets create db-password \
  --data-file=- \
  --replication-policy=user-managed \
  --locations=europe-west6

# Clé API MovePlanner (à recevoir)
echo -n "$MP_API_KEY" | gcloud secrets create moveplanner-api-key \
  --data-file=- \
  --replication-policy=user-managed \
  --locations=europe-west6

# Secret HMAC webhook MP
echo -n "$MP_WEBHOOK_HMAC_SECRET" | gcloud secrets create moveplanner-webhook-hmac \
  --data-file=- \
  --replication-policy=user-managed \
  --locations=europe-west6

# JWT signing key
echo -n "$JWT_PRIVATE_KEY" | gcloud secrets create jwt-signing-key \
  --data-file=- \
  --replication-policy=user-managed \
  --locations=europe-west6
```

Accordez l'accès à chaque secret au service account Cloud Run (§13).

---

## 12. Artifact Registry (images Docker)

```bash
gcloud artifacts repositories create interim-docker \
  --repository-format=docker \
  --location=europe-west6 \
  --description="Interim agency docker images"
```

---

## 13. Service accounts et Cloud Run

Créer un service account dédié pour chaque app (principe least privilege).

```bash
# Service account pour l'API
gcloud iam service-accounts create sa-interim-api \
  --display-name="Interim API Service Account"

# Permissions minimales
for ROLE in \
  roles/cloudsql.client \
  roles/secretmanager.secretAccessor \
  roles/storage.objectUser \
  roles/logging.logWriter \
  roles/monitoring.metricWriter \
  roles/cloudtrace.agent
do
  gcloud projects add-iam-policy-binding $GCP_PROJECT \
    --member=serviceAccount:sa-interim-api@$GCP_PROJECT.iam.gserviceaccount.com \
    --role=$ROLE
done

# Déployer Cloud Run (à faire une fois l'image construite via CI)
gcloud run deploy interim-api \
  --image=europe-west6-docker.pkg.dev/$GCP_PROJECT/interim-docker/api:latest \
  --region=europe-west6 \
  --service-account=sa-interim-api@$GCP_PROJECT.iam.gserviceaccount.com \
  --vpc-connector=interim-connector \
  --vpc-egress=private-ranges-only \
  --min-instances=1 --max-instances=10 \
  --set-secrets=DATABASE_URL=db-password:latest,MP_API_KEY=moveplanner-api-key:latest,MP_WEBHOOK_HMAC=moveplanner-webhook-hmac:latest \
  --no-allow-unauthenticated
```

Répéter pour `interim-worker` et `interim-web-admin`, `interim-web-portal`.

---

## 14. OIDC Workload Identity Federation (CI GitHub Actions)

Évite de stocker une clé de service account dans GitHub secrets (risque de fuite).

```bash
# Créer le pool
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions pool"

# Créer le provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub OIDC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == 'kreuille/interim-agency-system'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Service account pour CI
gcloud iam service-accounts create sa-github-deploy \
  --display-name="GitHub Actions deploy SA"

# Lier le pool au SA
gcloud iam service-accounts add-iam-policy-binding \
  sa-github-deploy@$GCP_PROJECT.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe $GCP_PROJECT --format='value(projectNumber)')/locations/global/workloadIdentityPools/github-pool/attribute.repository/kreuille/interim-agency-system"

# Permissions de déploiement
for ROLE in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/iam.serviceAccountUser \
  roles/cloudsql.client
do
  gcloud projects add-iam-policy-binding $GCP_PROJECT \
    --member=serviceAccount:sa-github-deploy@$GCP_PROJECT.iam.gserviceaccount.com \
    --role=$ROLE
done
```

Dans GitHub repo settings, ajouter les variables :
- `GCP_PROJECT_ID`
- `GCP_WIF_PROVIDER` (valeur retournée par la commande `gcloud iam workload-identity-pools providers describe ...`)
- `GCP_SA_EMAIL` (`sa-github-deploy@$GCP_PROJECT.iam.gserviceaccount.com`)

Mettre à jour `.github/workflows/release.yml` pour utiliser `google-github-actions/auth@v2` avec `workload_identity_provider`.

---

## 15. Monitoring et alertes de base

```bash
# Notification channel email
gcloud alpha monitoring channels create \
  --display-name="Fondateur email" \
  --type=email \
  --channel-labels=email_address=fondateur@monagence.ch

# Alerte Cloud SQL CPU > 80% pendant 10min
# (à compléter via UI ou fichier YAML — voir ops/grafana déjà en place)
```

Dans le code : configurer `@opentelemetry/exporter-trace-otlp-grpc` pointant vers Google Cloud Trace. Déjà fait en A6.3, il suffit de setter `OTEL_EXPORTER_OTLP_ENDPOINT` en prod.

---

## 16. Checklist finale

- [ ] Compte GCP créé, facturation active, DPA Switzerland signé.
- [ ] Projets staging et prod distincts.
- [ ] Toutes les APIs activées.
- [ ] Région partout `europe-west6`.
- [ ] KMS keyring + 2 clés avec rotation 90j.
- [ ] VPC + serverless connector.
- [ ] Cloud SQL avec CMEK + PITR + backups.
- [ ] Memorystore Redis.
- [ ] 3 buckets (docs, GED légale, backups) avec CMEK + rétention.
- [ ] Secret Manager avec tous les secrets poussés.
- [ ] Artifact Registry prêt.
- [ ] Service accounts avec least privilege.
- [ ] OIDC WIF configuré vers GitHub.
- [ ] Alertes de base (billing + CPU + 5xx).
- [ ] ADR-0002 mise à jour avec les IDs réels (projet, KMS, buckets, etc.).
- [ ] Secrets et IDs documentés dans un vault interne (1Password ou équivalent) — **jamais dans le repo**.

---

## 17. Coût mensuel estimé (run de base)

| Service | Unité | Estimation mensuelle |
|---------|-------|----------------------|
| Cloud SQL db-custom-2-7680 | 1 instance | 180 CHF |
| Memorystore Redis 1 GB | 1 instance | 50 CHF |
| Cloud Run (4 services, 1 min instance) | variable | 60-120 CHF |
| Cloud Storage (≤ 50 GB) | | 10 CHF |
| KMS | 2 clés + 100k opérations | 5 CHF |
| Egress | 10 GB/mois estimé | 10 CHF |
| Monitoring + Logs + Trace | | 30-50 CHF |
| **Total estimé** | | **~350-450 CHF/mois** |

À ajuster selon volume réel après le pilote.

---

## 18. Quand appeler un devops freelance

Si tu décroches ou hésites sur :
- Les permissions IAM et la sécurité (il est facile de faire trop permissif).
- La configuration VPC + service networking.
- Le déploiement Cloud Run avec secrets + VPC connector.
- L'OIDC WIF (la première fois c'est rude).

Prix du marché CH romande : 120-180 CHF/h, compte 2-3 jours pour setup complet = 3-5 kCHF. Demande à avoir l'IaC (Terraform de préférence) en sortie, pas juste un setup manuel.

Prestataires recommandés :
- **Infomaniak Services** (Genève) — même s'ils sont plus Infomaniak, ils font du GCP.
- **Devoteam Suisse Romande** (Lausanne) — plus cher mais sérieux.
- **Freelance via Malt ou LinkedIn** — profil "Google Cloud Professional Cloud Architect".

---

**Fin du document v1.0 — 2026-04-23**
