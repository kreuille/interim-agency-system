# Runbook — Secret leaked (clé API, HMAC, certif, mot de passe)

> **Sévérité** : 🔴 critical
> **Owner** : DPO + DevOps + direction (notifier immédiatement)
> **Cible résolution** : rotation **immédiate** (< 30 min)
> **Dernière maj** : 2026-04-22

## 1. Déclencheur

- Email automatique GitHub : "Secret detected in commit"
- Rapport Sentry / log avec secret en clair (review code)
- Rapport pentest externe / bug bounty
- Communication tiers (MP/Swisscom/Infomaniak) : "Vous nous avez exposé X"
- Découverte interne fortuite (review PR)

## 2. Action immédiate (≤ 30 min) — RÉVOQUER AVANT D'INVESTIGUER

### 2.1 Identifier le type de secret

| Type | Source typique | Action priorité 1 |
|------|----------------|-------------------|
| MP API key | `MP_API_KEY` env | Révoquer côté MP portal partenaire |
| Webhook HMAC secret MP | `MP_WEBHOOK_SECRET_CURRENT` | Rotation via secret manager + endpoint MP rotate |
| Webhook HMAC Swisscom | `SWISSCOM_HMAC_SECRET` | Idem côté Swisscom Trust portal |
| Cert mTLS MP | `MP_MTLS_CERT_PEM` | Révoquer cert + renouveler via SECO/MP CA |
| DB password Postgres | `DATABASE_URL` | Rotation via Cloud SQL admin |
| GCS service account JSON | `GCS_SA_KEY` | Disable key dans IAM + créer nouvelle |
| JWT signing secret (auth admin) | `JWT_SECRET` | Rotation + invalidation tokens existants |
| Sentry DSN | `SENTRY_DSN` | Révoquer + créer nouveau (faible impact) |
| Twilio/Infomaniak SMS | `SMS_API_KEY` | Console fournisseur → revoke |

### 2.2 Rotation immédiate

```bash
# 1. Générer le nouveau secret (cryptographiquement fort)
openssl rand -hex 32  # pour HMAC, JWT
openssl rand -base64 48  # pour API keys

# 2. Mettre à jour secret manager (Infomaniak / Swisscom KMS / GCP Secret Manager)
gcloud secrets versions add mp-webhook-secret-current --data-file=- <<< "$NEW_SECRET"

# 3. Configurer le PREVIOUS pour rotation gracieuse
# (le code accepte current + previous pendant 7 jours)
gcloud secrets versions add mp-webhook-secret-previous --data-file=- <<< "$OLD_SECRET"

# 4. Rolling restart pods (pour reload config)
kubectl rollout restart deploy/api deploy/worker -n prod

# 5. Vérifier que les pods ont la nouvelle version
kubectl exec -n prod deploy/api -- env | grep MP_WEBHOOK_SECRET_CURRENT_VERSION
```

### 2.3 Coordination tiers

- **MP** : appel direct partner-support@moveplanner.example + email avec :
  - Ancien secret (préfixe seulement, ne pas envoyer en entier)
  - Heure suspectée fuite
  - Nouveau secret transmis via canal sécurisé (Signal/PGP, JAMAIS email plain)
- **Swisscom** : portail Trust → rotate dans interface sandbox d'abord, puis prod
- **Banque** (si compte EBICS / cert) : appel hotline dédiée, suivi compte 24h

## 3. Investigation post-rotation (≤ 4h)

### 3.1 Périmètre exposition

```bash
# Si fuite via Git : trouver tous les commits qui contiennent le secret
git log --all --full-history -p | grep -B5 -A5 "<SECRET_PATTERN>"

# Vérifier si forks existent (GitHub Search)
gh search code --regexp "<SECRET_PARTIAL>" --limit 100

# Audit logs : qui a accédé au secret manager dans les 30 derniers jours
gcloud logging read 'protoPayload.serviceName="secretmanager.googleapis.com" AND \
  protoPayload.resourceName=~"mp-webhook-secret"' --limit 100
```

### 3.2 Évaluer impact

- **Si secret HMAC webhook** :
  - Inspecter `inbound_webhook_events` table : signatures rejouées (hmac_valid=true) entre fuite et rotation = potentiellement spoofed
  - Vérifier `eventId` dupliqués qui auraient dû être bloqués par idempotency
- **Si secret API key** :
  - Logs API call pattern anormal (bursts, IP non-listées)
  - `outbound_idempotency_keys` doublons inhabituels
- **Si secret DB / GCS** :
  - 🚨 **Considérer données compromises**. Lancer DPIA art. 24 nLPD.
  - Inventory des tables/blobs accessibles avec ces creds
  - Si données personnelles inclues → notification PFPDT (autorité fédérale) sous **72h**

### 3.3 Nettoyage Git (si secret en commit public)

⚠️ **Ne JAMAIS** simplement supprimer le commit : reste dans l'historique remote.

```bash
# Solution réelle : BFG Repo Cleaner
java -jar bfg.jar --replace-text passwords.txt repo.git
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force --all  # ⚠️ casse PRs en cours, prévenir équipe avant
```

Mais : **partir du principe que le secret est compromis pour toujours**. Rotation > nettoyage.

## 4. Communication

### 4.1 Interne (immédiat)

```markdown
@channel #incidents 🚨 SEC-INCIDENT [HH:MM]
Type : <secret type>
Source détection : <github-secret-scan|review|tiers>
Statut : ROTATION EN COURS / ROTATION TERMINÉE
Action requise équipe : aucun (handler : @oncall) / [actions concrètes]
Post-mortem dans 24h : <link>
```

### 4.2 Externe

- Si données personnelles compromises :
  - PFPDT (autorité fédérale nLPD) sous 72h via formulaire en ligne
  - Personnes concernées : email/courrier individualisé sous 30j max (art. 24 al. 4 nLPD)
- Si client B2B impacté : email manager direct dans la journée
- Pas de tweet / blog public sans coordination juridique + direction

## 5. Vérification post-rotation

```bash
# Ancien secret rejeté
curl -i -H "x-mp-api-key: $OLD_SECRET" prod-api/api/v1/health
# Doit retourner 401

# Nouveau secret accepté
curl -i -H "x-mp-api-key: $NEW_SECRET" prod-api/api/v1/health
# 200

# Rotation gracieuse vérifiée (previous still works pendant grace period)
# Webhook avec PREVIOUS_SECRET → 200 (cf. createMoveplannerWebhookRouter accept current+previous)

# Pas de pic d'erreurs HMAC après rotation
curl -s prod-api/metrics | grep webhook.hmac.invalid
# Le compteur ne doit plus augmenter

# Audit log entry pour cette rotation
psql -c "SELECT * FROM audit_logs WHERE entity_type='Secret' AND occurred_at > now()-interval '1h'"
```

## 6. Post-mortem (obligatoire pour tout secret leak, peu importe sévérité)

Template `docs/runbooks/postmortems/YYYY-MM-DD-secret-leak-<type>.md` :

```markdown
# Post-mortem : fuite secret <type>

**Date détection** : YYYY-MM-DD HH:MM UTC
**Date rotation** : YYYY-MM-DD HH:MM UTC (durée exposition : Xh)
**Détecté par** : <github-scan|interne|tiers>

## Cause racine
[Pourquoi le secret a été exposé : commit accidentel, screen-share, log non sanitized, etc.]

## Impact
- Données potentiellement exposées : [oui/non + détail]
- Personnes concernées : [count + notification status]
- Tiers impactés : [liste + notification status]

## Actions correctives
- [ ] Rotation faite
- [ ] Code review : ajout règle pre-commit (gitleaks, talisman)
- [ ] CI : scan secrets actif sur tous les PR
- [ ] Documentation : mise à jour onboarding sec
- [ ] Formation : session équipe à planifier

## Notification PFPDT
- [ ] Soumise le YYYY-MM-DD HH:MM (référence : XXX)
- [ ] Réponse reçue le : ...
- [ ] Suivi : ...

## Notification clients/workers
- Templates utilisés : ...
- Date envoi : ...
```

## 7. Prévention future

- Pre-commit hook obligatoire : `gitleaks` ou `talisman`
- CI : `trufflehog` sur tous les PR
- Politique : aucun secret en clair JAMAIS, même temporairement
- Onboarding sec : revue trimestrielle
- `.env.example` toujours utilisé, vrais `.env` jamais commit

## 8. Références

- `apps/api/src/infrastructure/webhooks/secret-rotation.service.ts` (rotation HMAC)
- `apps/api/src/infrastructure/webhooks/hmac-verifier.ts` (accept current+previous)
- `apps/api/src/infrastructure/webhooks/swisscom-hmac-verifier.ts` (idem Swisscom)
- nLPD art. 24 : devoir de notification 72h
- CLAUDE.md §3.4 : règles secrets
