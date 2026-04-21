# Plan de développement — Agence d'Intérim

> **Version** : 1.0 — 2026-04-21
> **Horizon** : ~11 semaines de build + 2 semaines de hardening / pilote
> **Équipe cible** : 2 devs full-stack + 1 PO/fondateur + 1 lead tech (CTO fractionnel ou sénior dédié) + juriste/DPO à la demande
> **Méthodologie** : Scrum-like, sprints d'1 ou 2 semaines, démo vendredi, rétro mensuelle

---

## 1. Vision du plan

Livrer en un seul trimestre un système d'agence d'intérim **conforme à la loi suisse**, **multi-client dès le départ** et **intégré par API à MovePlanner**, capable de tenir son premier pilote commercial avec MovePlanner et 5 à 10 intérimaires réels.

Le plan est conçu pour qu'à chaque fin de sprint, un incrément soit démontrable au fondateur **et testable par un utilisateur réel** (intérimaire, gestionnaire d'agence, chef d'équipe MovePlanner de test).

---

## 2. Jalons majeurs

| Jalon | Date cible | Critère de passage |
|-------|-----------|--------------------|
| **J0 — Kickoff** | S0 | Brief validé, équipe constituée, infra CH commandée, accès MovePlanner sandbox obtenu |
| **J1 — Synchro dispos MP** | S3 | Dispo d'un intérimaire de test remonte de notre système vers MovePlanner sandbox et revient en proposition |
| **J2 — Cycle mission complet** | S7 | De la proposition webhook à la signature du contrat, tout s'enchaîne |
| **J3 — Paie & facture pilote** | S10 | Première paie hebdo + facture QR-bill émise et payée (en sandbox) |
| **J4 — Go-live pilote** | S12 | 1 intérimaire réel placé chez 1 client réel via le système, en prod |

---

## 3. Phasage détaillé (sprints)

### Sprint A.0 — Setup (1 semaine)

**Objectif** : infrastructure prête, équipe capable de committer et déployer.

Livrables :
- Monorepo pnpm workspaces (`apps/api`, `apps/web-admin`, `apps/web-portal`, `packages/shared`, `packages/domain`)
- Docker Compose local (Postgres 16, Redis, MailHog, Swagger UI)
- CI GitHub Actions : lint, typecheck, tests unit, build Docker, scan Trivy
- Hébergement CH provisionné (Infomaniak ou Exoscale), projet staging + prod séparés
- Auth Firebase/Supabase configurée avec tenant de test
- Secret manager actif (aucun secret en env committable)
- `CLAUDE.md`, `README.md`, `docs/adr/0001-*` validés

Prompts : `A0.1` → `A0.6` (voir `prompts/sprint-a0-setup/`)

Definition of Done : un dev qui clone le repo + lance `make up` peut tester un endpoint `/health` en HTTPS local, avec auth mockée, sans secret dans Git.

### Sprint A.1 — Core métier (2 semaines)

**Objectif** : CRUD des entités centrales et contrats cadres.

Livrables :
- Entités : `TempWorker`, `WorkerDocument` (permis B/C/L/G, AVS, LAMal, diplômes), `Qualification`, `DrivingLicense` (CH cat. B/C1/C/CE/D), `Client`, `ClientContract`, `RateCard`
- CRUD complets + validations Zod strictes (AVS mod 11, IDE, IBAN mod 97)
- Alertes d'expiration de documents (job cron, table `document_alerts`, webhook sortant `document.expiring`)
- Back-office Next.js : tables + formulaires + upload documents (chiffrement CMEK)
- Audit log sur toutes les mutations (table `audit_logs` append-only)
- Tests unit + intégration ≥ 80% couverture

Prompts : `A1.1` → `A1.7`

Definition of Done : je peux créer un intérimaire Jean Dupont, uploader son permis B, voir l'alerte à J-30 de l'expiration, et tracer chaque modification dans `audit_logs`.

### Sprint A.2 — Disponibilités et push MP (2 semaines)

**Objectif** : synchro de dispos bidirectionnelle avec MovePlanner.

Livrables :
- Entité `WorkerAvailability` (slots, statut, source, TTL)
- UI calendrier hebdo (react-big-calendar ou fullcalendar)
- Saisie agence (admin) + saisie intérimaire (portail PWA mobile)
- Indispos récurrentes (RRULE ICS) + ponctuelles
- Client API MovePlanner typé (OpenAPI → code generation via `orval` ou `openapi-typescript`)
- Queue BullMQ `availability-sync` avec retry exponentiel
- `POST /api/v1/partners/{id}/workers/{staffId}/availability` appelé à chaque changement + batch nightly 04:00
- Idempotency keys persistées (table `outbound_idempotency_keys`)
- Circuit breaker (opossum) sur le client MP avec alerting Sentry

Prompts : `A2.1` → `A2.6`

Definition of Done : je déclare 8h-17h lundi pour Jean → POST MovePlanner sandbox OK en < 30s → j'invalide → POST `unavailable` OK.

### Sprint A.3 — Webhooks entrants & mission proposals (2 semaines)

**Objectif** : recevoir les propositions MovePlanner et les router.

Livrables :
- Endpoint `POST /webhooks/moveplanner` avec vérif HMAC-SHA256 + tolérance horloge ±5min
- Persistence `inbound_webhook_events` (idempotence par `X-MovePlanner-Event-Id`)
- Dispatcher vers handlers BullMQ par type d'événement
- Entités `MissionProposal` + états (proposed, pass-through-sent, agency-review, accepted, refused, timeout, expired)
- Mode pass-through : SMS Swisscom Enterprise vers intérimaire avec shortlink MP
- Mode contrôlé : UI admin liste + validation + renvoi SMS interne
- Gestion des événements `worker.assignment.accepted/refused/timeout/replaced`
- Dashboard live (SSE ou polling court) des propositions en cours
- Tests E2E avec faux webhooks signés

Prompts : `A3.1` → `A3.6`

Definition of Done : MovePlanner sandbox émet `worker.assignment.proposed` → je le vois dans le dashboard en < 5s → en pass-through, Jean reçoit un SMS testable → accepte → je reçois `accepted` et déclenche la génération de contrat.

### Sprint A.4 — Contrats de mission & timesheets (2 semaines)

**Objectif** : cycle légal complet d'une mission.

Livrables :
- Entité `MissionContract` générée à l'acceptation d'une proposition
- Modèles de contrat par branche (CCT Location de services — Transport, BTP, Logistique)
- Génération PDF via `pdf-lib` ou `puppeteer` + template Handlebars/React-PDF
- Signature électronique : intégration Swisscom Trust Signing Services (ZertES)
- Archivage GED chiffré (10 ans de conservation imposée par LSE)
- Réception webhook `timesheet.ready_for_signature` → tâche de contrôle
- Écran de comparaison heures planifiées vs déclarées, détection anomalies (dépassement 50h, pause < 30min si journée > 7h, etc.)
- `POST /api/v1/partners/{id}/timesheets/{id}/sign` et `/dispute` implémentés
- Validation tacite à J+7 si non-action (job cron)

Prompts : `A4.1` → `A4.7`

Definition of Done : proposition acceptée → contrat PDF généré, signé par SMS OTP, archivé ; relevé reçu → je le contrôle → je signe → MP confirme.

### Sprint A.5 — Paie hebdomadaire & facturation QR-bill (2-3 semaines)

**Objectif** : la machine à cash tourne.

Livrables :
- Moteur de paie : calcul heures normales × taux CCT, majorations (nuit 25%, dimanche 50%, supp 25%), 13ᵉ au prorata (8.33%), vacances (8.33% <50 ans, 10.64% ≥50 ans), jours fériés cantonaux
- Retenues : AVS/AI/APG, AC, LAA (SUVA ou privé), LPP dès seuil 22'050 CHF/an, impôt à la source par barème cantonal
- Génération bulletin de salaire PDF au standard suisse
- Annonce ELM (échange électronique) vers caisses sociales — adapter Swissdec
- Export ISO 20022 `pain.001` pour virement bancaire (PostFinance ou UBS)
- Facturation client : agrégation mensuelle timesheets signés, coefficient agence, TVA 8.1%, QR-bill conforme Swiss Payment Standards
- Envoi email + webhook sortant vers MovePlanner pour rapprochement
- Relances automatiques impayés : J+7 rappel, J+15 relance ferme, J+30 mise en demeure
- Export comptable Bexio et Abacus (API natives)

Prompts : `A5.1` → `A5.9`

Definition of Done : vendredi 20h, Jean a bossé 40h sem 18 → bulletin PDF généré, virement pain.001 prêt, annonce ELM envoyée, et la facture MP du mois contient ses heures avec QR-bill valide.

### Sprint A.6 — Conformité, hardening, go-live (1-2 semaines)

**Objectif** : production-ready et audit-ready.

Livrables :
- Tableau de bord conformité : LSE autorisation, CCT à jour, documents intérimaires par statut, registre des missions en cours
- Export contrôle SECO/OCE (1 clic, format PDF + CSV)
- Reporting financier (CA, marge par client, par branche) + RH (placement, rotation)
- Pentest externe (prestataire CH recommandé : Kudelski, Compass Security)
- Observabilité : Sentry + Grafana Cloud (logs structurés JSON, métriques RED, traces OpenTelemetry)
- Runbooks d'incident (voir `skills/ops/`)
- Backup Postgres + test de restauration prouvé
- Plan de continuité : RPO 15 min, RTO 4 h
- Documentation utilisateur (agence + intérimaire) en FR + DE (léger)
- Go-live pilote avec 1 client (MovePlanner sandbox → MP prod) et 1-3 intérimaires réels

Prompts : `A6.1` → `A6.7`

Definition of Done : un contrôle SECO obtiendrait en < 1h toutes les pièces ; Sentry n'a pas d'erreur critique ouverte > 24h ; le pilote tourne 2 semaines sans intervention manuelle sur incident.

---

## 4. Chemin critique et dépendances

```
A.0 setup ─► A.1 core ─► A.2 dispo+push ─► A.3 webhooks ─► A.4 contrats/timesheets ─► A.5 paie/factu ─► A.6 go-live
                └──── en parallèle de A.2 : onboarding MovePlanner sandbox + obtention certificats mTLS
                                       └──── en parallèle de A.4 : négociation contrat Swisscom Trust Signing
                                                             └──── en parallèle de A.5 : ouverture comptes PostFinance/UBS Business + mandat ELM
```

Blocage amont majeur : obtenir **sandbox MovePlanner** dès S1. Sans sandbox, A.2 est bloqué. Prévoir fallback : mock server OpenAPI local dans `apps/mock-moveplanner/` pour dédoubler les tests E2E si MP tarde.

---

## 5. Budget temps (estimation haute)

| Sprint | Dev 1 (j-h) | Dev 2 (j-h) | Lead (j-h) | PO (j-h) | Juriste (j-h) |
|--------|-------------|-------------|------------|----------|--------------|
| A.0 | 5 | 5 | 3 | 2 | 0 |
| A.1 | 10 | 10 | 4 | 4 | 1 |
| A.2 | 10 | 10 | 4 | 3 | 0 |
| A.3 | 10 | 10 | 4 | 3 | 0 |
| A.4 | 10 | 10 | 4 | 3 | 2 |
| A.5 | 13 | 13 | 6 | 5 | 3 |
| A.6 | 7 | 7 | 5 | 4 | 2 |
| **Total** | **65** | **65** | **30** | **24** | **8** |

Environ **190 jours-homme**. Marge d'imprévus conseillée : +20% (≈ 230 j-h).

---

## 6. Coûts récurrents prévisibles (ordre de grandeur, CHF/mois)

- Hébergement CH (Infomaniak Public Cloud, taille MVP) : 300–600
- Firebase Auth / Supabase : 50–150
- Swisscom Enterprise SMS : variable, ≈ 0.10 CHF / SMS × volume
- Swisscom Trust Signing Services : 1–3 CHF / signature ZertES qualifiée
- Sentry + Grafana : 80–150
- Bexio ou Abacus (subscription) : 60–200
- Domaine + certificats : 30

Prévoir **~1 000 CHF/mois** en run de base, hors SMS/signatures qui scalent avec le volume.

---

## 7. Livrables transverses (non liés à un sprint)

- `docs/adr/` : décisions architecturales au fil de l'eau
- `docs/compliance/registre-traitements.md` : registre nLPD, mise à jour continue
- `docs/compliance/dpia-intérimaires.md` : analyse d'impact protection données
- `docs/runbooks/*.md` : runbooks d'incident (ex. MP injoignable, webhook storm, fuite de secret)
- `docs/contrats-types/` : modèles de contrats de mission par branche CCT

---

## 8. Risques majeurs et mitigations (en résumé — voir `docs/06-risques.md`)

Les risques identifiés critiques sont : le retard MovePlanner sandbox, l'évolution annuelle CCT, la dépendance fournisseur signature ZertES, la charge de conformité nLPD sous-estimée, et la difficulté de recruter des devs TypeScript seniors parlant français en Suisse. Les mitigations principales : mock MP local, abonnement swissstaffing pour les barèmes CCT, clause de sortie contractuelle Swisscom, allocation explicite 8 j-h de juriste dans le budget, et ouverture au remote Suisse romande + France frontalière.

---

## 9. Comment avancer concrètement demain matin

1. Valider ce plan avec le fondateur + lead tech (relecture croisée)
2. Exécuter le prompt `A0.1-init-monorepo.md` dans une session Claude Code dédiée, sur une nouvelle branche `feat/A0.1-init-monorepo`
3. Commander l'hébergement CH (Infomaniak Public Cloud "Lot 2" en défaut)
4. Envoyer la demande d'accès sandbox à l'équipe MovePlanner (template dans `docs/moveplanner/demande-sandbox.md` à rédiger en A.0)
5. Ouvrir le dossier d'autorisation cantonale LSE si pas encore fait (parallèle, hors scope dev)

---

**Fin du plan de dev v1.0**
