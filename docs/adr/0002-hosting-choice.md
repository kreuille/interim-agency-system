# ADR-0002 — Choix de l'hébergeur : Google Cloud Platform (europe-west6 Zurich)

- **Date** : 2026-04-21
- **Statut** : accepté
- **Décideurs** : fondateur, lead tech
- **Contexte du prompt** : BLOCKER-003 (était A0.4)
- **Remplace** : — (premier ADR hosting)

## Contexte

Nous devons héberger le SI d'une agence suisse d'intérim contenant des données personnelles sensibles (intérimaires, salaires, permis) et des documents à conserver 10 ans (contrats, bulletins, factures). Les contraintes :

1. **Hébergement physique en Suisse** (nLPD + confiance clients + pas de transferts hors CH sans DPA signé).
2. **Managed services** pour Postgres 16 + Redis 7 + Object Storage.
3. **Secret manager** + **chiffrement au repos CMEK** possibles.
4. **OIDC trust** pour GitHub Actions (pas de long-lived deploy token).
5. **Alignement stack MovePlanner** : si MP est sur GCP, avoir la même plateforme simplifie les patterns inter-systèmes.
6. **Coût raisonnable** en phase MVP (<1000 CHF/mois en run).

## Options considérées

1. **Google Cloud Platform — région `europe-west6` (Zurich)** ✅ *retenu*
2. Infomaniak Public Cloud (Genève/Lausanne)
3. Exoscale (Genève/Zurich/Vienne)
4. AWS — région `eu-central-2` (Zurich)
5. Azure — région `Switzerland North` (Zurich)

## Décision

**GCP europe-west6 (Zurich)**.

Services cibles :

| Besoin | Service GCP |
|--------|-------------|
| Compute (API, worker, web-admin, web-portal) | Cloud Run (containers serverless) + Cloud Run Jobs pour BullMQ |
| Base de données | Cloud SQL PostgreSQL 16 (régional, HA) |
| Redis (queues BullMQ) | Memorystore for Redis |
| Object Storage (documents légaux chiffrés) | Cloud Storage avec CMEK via Cloud KMS |
| Secrets | Secret Manager |
| CI/CD deploy | OIDC Workload Identity Federation (GitHub Actions → GCP) |
| DNS + HTTPS | Cloud Load Balancing + Cloud DNS + certs Google-managed |
| Observabilité | Cloud Logging + Cloud Monitoring + Cloud Trace (complètent Sentry/Grafana côté app) |
| Auth (Firebase) | Firebase Identity Platform (même tenant GCP) — voir ADR-0003 |

## Conséquences

### Positives

- **Région `europe-west6` = Zurich, data centres en Suisse** → satisfait l'exigence nLPD/hébergement CH stricte.
- **Firebase Identity Platform = produit GCP natif** (ADR-0003) → pas de bascule auth vers un provider tiers plus tard.
- **OIDC Workload Identity Federation GitHub ↔ GCP** excellent support, aucun long-lived token à faire tourner manuellement (cf. DETTE-007 / sécurité CI).
- **Cloud Run** = scale-to-zero, donc coût proche de 0 en phase pilote. Montée en charge sans provisioning manuel.
- **CMEK Cloud KMS** : clé de chiffrement gérée par nous au repos sur Cloud Storage pour documents légaux. Conforme au principe "chiffrement en place" de CLAUDE.md §3.4.
- **Écosystème Terraform/Pulumi** mature pour IaC.
- **Secret Manager** : gestion des credentials (DB password, HMAC MovePlanner, API keys) sans fichier env local. Rotation programmable.

### Négatives

- **Hyperscaler US (Alphabet)**, pas un acteur suisse historique → analyse nLPD art. 16 renforcée requise. **DPA signé avec Google Cloud Switzerland GmbH** obligatoire avant production.
- **Dépendance tarifaire aux grilles GCP** (stables mais non-négociables à notre taille).
- **Pas de garantie "all-Swiss stack"** comme Infomaniak/Exoscale (où les équipes support sont locales). Support GCP en français possible mais escalade US.
- **Courbe d'apprentissage GCP** plus large qu'Infomaniak (plus de concepts IAM, VPC, projects).

### Neutres

- **Coût prévisible ~500–800 CHF/mois en pilote** (Cloud Run au prorata + Cloud SQL `db-custom-2-4096` + Memorystore `basic-1GB` + Cloud Storage). Comparable à Infomaniak.
- **Latence Zurich ↔ clients CH** : identique aux alternatives suisses (~5–15 ms).

## Conformité nLPD

Checklist à compléter avant la mise en production :

- [ ] **DPA Google Cloud Switzerland GmbH** signé (nLPD art. 9). Template DPA standard Google.
- [ ] **Data Processing Addendum** inclut la région `europe-west6` sans transfert (pas de repli automatique hors CH).
- [ ] **Analyse d'impact (DPIA)** `docs/compliance/dpia-interimaires.md` mise à jour avec sous-traitant GCP.
- [ ] **Registre des traitements** `docs/compliance/registre-traitements.md` mis à jour : sous-traitant = Google Cloud Switzerland GmbH.
- [ ] **VPC-SC perimeter** ou équivalent pour empêcher exfiltration inter-projects (durci en A0.4-hosting).
- [ ] **Audit logs Cloud Audit Logs** activés sur tous les services, retention ≥ 10 ans sur documents légaux.
- [ ] **Access Transparency** activé (log des accès Google support pour audit).

## Notes

Cette décision est réversible : Cloud Run + Cloud SQL PostgreSQL sont suffisamment standards pour qu'un rapatriement vers Infomaniak/Exoscale soit principalement un travail de remigration IaC + données (quelques jours-homme). Pas de vendor lock-in structurel si on évite **Firestore, BigQuery, Cloud Spanner** pour les données métier (on utilise Cloud SQL PostgreSQL qui est portable).

Le choix est à revisiter si :

- Google change les conditions d'hébergement de `europe-west6` (sortie CH improbable mais possible).
- L'autorisation SECO pour l'exploitation devient conditionnée à un hébergeur 100 % suisse (évolution réglementaire).
- MovePlanner révèle une stack incompatible (p. ex. Azure only) qui créerait des frictions réseau.

## Liens

- `docs/01-brief.md §6`
- `docs/03-plan-de-dev.md §6`
- `docs/05-architecture.md §8`
- `docs/06-risques.md R-006`
- `docs/compliance/registre-traitements.md`
- `CLAUDE.md §3.4`
- ADR-0003 (Firebase Identity Platform) — produit GCP natif donc cohérent
