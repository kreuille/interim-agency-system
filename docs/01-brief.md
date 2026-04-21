# Brief — Système d'information pour Agence d'Intérim

> **Version** : 1.0
> **Date** : 2026-04-21
> **Statut** : Brief — à développer dans une session séparée
> **Destinataire** : Équipe projet / session Claude Code dédiée à l'agence d'intérim
> **Document complémentaire** : `partners-interim-specification.md` (côté société de déménagement MovePlanner)

---

## 1. Contexte

Ce document est un **brief autonome** pour développer le système d'information d'une **agence suisse de travail temporaire (intérim)** qui s'intègre avec la plateforme **MovePlanner** — un SaaS de planification automatisée pour entreprises de déménagement.

Le projet est à développer dans une **session Claude Code séparée**, indépendamment du projet MovePlanner. Les deux systèmes communiquent uniquement par **API REST** (et optionnellement MCP) selon un contrat d'interface bien défini.

**Ne pas modifier le code MovePlanner depuis ce projet.** Le contrat d'interface est documenté dans `partners-interim-specification.md` § 7 (dans le repo MovePlanner) et résumé ici en § 5.

---

## 2. Vision et rôle dans l'écosystème

### 2.1 Écosystème

```
┌─────────────────────────────┐          ┌────────────────────────┐
│   AGENCE D'INTÉRIM          │          │      MOVEPLANNER       │
│   (CE PROJET)               │◄────────►│  (société déménagement) │
│                             │   API    │                        │
│  - Base intérimaires        │   REST   │  - Missions            │
│  - Disponibilités           │   +      │  - Planning OR-Tools   │
│  - Contrats                 │   Webhooks│  - Propositions        │
│  - Réception propositions   │          │  - Relevés d'heures    │
│  - Saisie paie hebdo        │          │  - Facturation         │
│  - Facturation client       │          │                        │
│  - Conformité LSE/CCT       │          │                        │
└─────────────────────────────┘          └────────────────────────┘
           ▲                                     ▲
           │                                     │
           ▼                                     ▼
     Intérimaires                          Clients MP (autres
     (SMS, portail,                        entreprises de déménagement
     app optionnelle)                      et BTP)
```

### 2.2 Rôle du système

Le système doit permettre à l'agence d'intérim de :

1. **Gérer son portefeuille d'intérimaires** : identité, qualifications, permis de travail suisses, certifications métier, documents légaux
2. **Suivre leur disponibilité** en temps réel et la **pousser vers MovePlanner** (et éventuellement d'autres clients à terme)
3. **Recevoir et traiter les propositions de mission** émises par MovePlanner (validation avant transmission à l'intérimaire, ou transmission directe via SMS)
4. **Superviser l'exécution** : quelle mission pour qui, quand, où
5. **Traiter les relevés d'heures** reçus de MovePlanner : contrôler, signer, contester
6. **Éditer la paie hebdomadaire** des intérimaires et déclarer aux assurances sociales
7. **Facturer** ses clients (MovePlanner et autres) avec QR-bill suisse
8. **Rester en conformité** LSE, CCT Location de services, nLPD, LAA, LPP, AVS/AI

### 2.3 Différenciateur clé

Contrairement aux outils classiques d'agences d'intérim (Pixid, Armado, PeoplePlanner — centrés sur le marché français), ce système est **nativement conçu pour la Suisse** et **intégré par API à MovePlanner**. Il permet à l'agence de proposer à ses clients PME du bâtiment/déménagement une **réactivité quasi-temps-réel** sur la disponibilité et l'affectation, sans ressaisie manuelle entre systèmes.

---

## 3. Contexte réglementaire suisse (à respecter strictement)

### 3.1 Loi sur le service de l'emploi (LSE) et son ordonnance

- **Autorisation cantonale** obligatoire pour toute activité de location de services. Le système doit tracer :
  - Numéro d'autorisation
  - Canton émetteur
  - Date d'émission, date d'expiration
  - Documents justificatifs
- **Autorisation fédérale** en plus si location à l'étranger ou depuis l'étranger
- **Registre des travailleurs loués** : l'agence doit pouvoir produire à tout moment la liste des missions en cours pour un contrôle

### 3.2 CCT Location de services

- Étendue par le Conseil fédéral (force obligatoire)
- Fixe les **salaires minimaux** par branche économique (déménagement, BTP, industrie, logistique…)
- Impose **13ᵉ salaire, vacances, allocations**, 8 jours fériés payés
- Le système doit embarquer une **table des salaires minimaux** par branche et les mettre à jour automatiquement (publication annuelle)
- Refus de créer un contrat de mission avec taux < minimum CCT

### 3.3 Droit du travail (LTr)

- 50 h/semaine max pour le bâtiment/déménagement
- Repos quotidien 11 h, hebdomadaire 35 h
- Majorations nuit 25%, dimanche 50%
- Heures supplémentaires majorées 25% (compensables en temps sinon)

### 3.4 Assurances sociales (obligations employeur)

- **AVS/AI/APG** : cotisation sur chaque salaire versé
- **AC** : assurance chômage
- **LAA** : assurance accidents professionnels ET non-professionnels (SUVA ou assureur privé)
- **LPP** : prévoyance professionnelle dès 22'050 CHF annuels (2026)
- **LAMal** : l'intérimaire gère lui-même son assurance maladie, mais l'agence doit pouvoir **retenir les primes** si cession

### 3.5 Permis de travail

| Permis | Description | Contrainte système |
|--------|-------------|---------------------|
| Citoyen CH | Liberté complète | Pas de contrainte |
| C | Établissement (≥ 5 ou 10 ans selon pays) | Pas de limite de durée |
| B | Séjour (1 an, renouvelable) | Alerte renouvellement à 60j |
| L | Courte durée (≤ 12 mois) | Alerte 30j, blocage à expiration |
| G | Frontalier | Vérification zone frontalière |

### 3.6 Fiscalité

- **Impôt à la source** : obligatoire pour B/L/G → prélevé par l'agence et reversé mensuellement au canton
- **TVA** : 8.1% normal. La location de services est soumise à TVA sauf exonérations spécifiques
- **QR-facture** : obligatoire pour les factures clients

### 3.7 Protection des données (nLPD)

- Consentement explicite pour données sensibles (santé, copie de permis)
- Registre des traitements
- Information transparente à l'intérimaire
- Droit à l'effacement (avec limites liées aux obligations de conservation : 10 ans contrats, 5 ans paie)

---

## 4. Fonctionnalités attendues (MVP)

### 4.1 Gestion des intérimaires

- CRUD intérimaire : identité, adresse, coordonnées, AVS, IBAN
- Documents : permis de travail, carte AVS, attestation LAMal, copie pièce d'identité, CV, diplômes, certifications (CACES, SST suisse, etc.)
- Qualifications : métier, spécialités (ex. déménageur, chauffeur C1, conducteur d'engins)
- Permis de conduire suisses (cat. B, C1, C, CE, D)
- Historique missions, notes d'évaluation, score de fiabilité
- Alertes d'expiration de documents (permis, certifications)

### 4.2 Gestion des clients (dont MovePlanner)

- CRUD client : identité, IDE, contacts, adresses, conditions commerciales
- Grille tarifaire par client × rôle (coefficients multiplicateurs, majorations)
- Clauses contractuelles (délais de paiement, pénalités…)
- Suivi du plafond de crédit et des en-cours

### 4.3 Disponibilités

- Saisie manuelle par l'intérimaire (portail mobile) OU par l'agence
- Calendrier hebdomadaire visuel
- Indisponibilités récurrentes (ex. tous les mercredis)
- Indisponibilités ponctuelles (maladie, vacances, formation)
- **Push automatique vers MovePlanner** à chaque changement (voir § 5)

### 4.4 Traitement des propositions de mission

- Réception webhook MovePlanner → création automatique d'une `mission_proposal`
- Tableau de bord : propositions en attente, acceptées, refusées, timeout
- Deux modes configurables :
  - **Mode pass-through** : transmission directe par SMS à l'intérimaire avec URL MovePlanner
  - **Mode contrôlé** : l'agence valide d'abord, puis envoie elle-même à l'intérimaire (via son propre canal, ou rebascule vers MovePlanner pour envoi SMS)

### 4.5 Contrats de mission (contrat-cadre + missions)

- Édition automatique du **contrat de mission** à chaque acceptation (document légal obligatoire LSE)
- Modèles pré-remplis par branche / client
- Signature électronique intérimaire (via SMS OTP)
- Archivage dans GED avec conservation 10 ans

### 4.6 Réception et traitement des relevés d'heures

- Réception webhook MovePlanner `timesheet.ready_for_signature` → création d'un `timesheet_to_review`
- Écran de contrôle par mission/intérimaire :
  - Heures déclarées par le chef d'équipe MovePlanner
  - Comparaison avec horaires contractuels
  - Détection d'anomalies (dépassement 50h, pause manquante…)
- Actions : signer, contester (avec motif), valider après amendement
- POST vers MovePlanner API pour signer ou contester

### 4.7 Paie hebdomadaire

- Calcul automatique à partir des `timesheet` signés :
  - Heures normales × taux CCT/branche
  - Majorations nuit, dimanche, supp
  - 13ᵉ salaire au prorata (8.33%)
  - Vacances au prorata (8.33% ou 10.64% selon âge)
  - Jours fériés payés
  - Retenues AVS/AC/LAA/LPP
  - Retenue impôt à la source selon barème cantonal
- Génération bulletin de salaire PDF
- Export fichier ISO 20022 pour paiement bancaire
- Annonce ELM (échange électronique des données salariales) aux caisses sociales

### 4.8 Facturation client (vers MovePlanner)

- Agrégation mensuelle (ou selon fréquence contractuelle) des relevés signés
- Application du coefficient multiplicateur agence
- Calcul TVA 8.1%
- Génération **QR-bill** PDF conforme
- Envoi par email + push webhook vers MovePlanner (`/api/v1/partners/{id}/invoices/import` — endpoint MovePlanner à créer ou fichier PDF)
- Relances automatiques si impayé (J+7, J+15, J+30, mise en demeure)

### 4.9 Conformité et reporting

- Tableau de bord conformité : autorisations valides, CCT à jour, documents intérimaires à jour
- Export pour contrôles SECO / OCE / cantons
- Reporting financier (CA, marge par client, par branche)
- Indicateurs RH : taux de placement, rotation, satisfaction

---

## 5. Contrat d'interface avec MovePlanner

### 5.1 Principes

Voir `partners-interim-specification.md` § 7 pour le détail complet. Résumé ici.

- Transport : HTTPS + TLS 1.3 + **mTLS**
- Auth : mTLS certificat + `Authorization: Bearer {api_key}`
- Rotation clé API : 90 jours
- Signature webhooks : HMAC-SHA256, header `X-MovePlanner-Signature`
- Idempotence : header `Idempotency-Key` sur POST/PUT
- Rate limit : 100 req/min, 1000 req/jour
- Versioning : `/api/v1/…`
- Format : JSON

### 5.2 Ce que le système agence doit APPELER sur MovePlanner

| Méthode | Endpoint MovePlanner | Usage |
|---------|---------------------|-------|
| `POST` | `/api/v1/partners/{partnerId}/workers` | Déclarer/MAJ un intérimaire |
| `DELETE` | `/api/v1/partners/{partnerId}/workers/{staffId}` | Retirer un intérimaire |
| `POST` | `/api/v1/partners/{partnerId}/workers/{staffId}/availability` | Publier dispos |
| `POST` | `/api/v1/partners/{partnerId}/workers/{staffId}/unavailable` | Indispo immédiate |
| `POST` | `/api/v1/partners/{partnerId}/assignments/{requestId}/response` | Accept/refus au nom du worker |
| `POST` | `/api/v1/partners/{partnerId}/timesheets/{timesheetId}/sign` | Signer un relevé |
| `POST` | `/api/v1/partners/{partnerId}/timesheets/{timesheetId}/dispute` | Contester un relevé |
| `GET` | `/api/v1/partners/{partnerId}/timesheets` | Lister relevés |
| `GET` | `/api/v1/partners/{partnerId}/assignments` | Lister affectations |
| `GET` | `/api/v1/partners/{partnerId}/invoices` | Lister factures d'achat |

### 5.3 Ce que le système agence doit ÉCOUTER (webhooks MovePlanner)

Le système doit exposer un **endpoint HTTPS** unique (ex. `POST https://api.monagence.ch/webhooks/moveplanner`) qui reçoit tous les événements. Auth : vérification HMAC-SHA256.

Événements à traiter :

| Événement | Action côté agence |
|-----------|--------------------|
| `worker.assignment.proposed` | Créer une mission_proposal, enclencher routage (pass-through ou contrôle) |
| `worker.assignment.accepted` | Générer contrat de mission, notifier l'intérimaire |
| `worker.assignment.refused` | Logger, MAJ dashboard |
| `worker.assignment.timeout` | Logger, pas de contrat |
| `worker.assignment.replaced` | Notifier gestionnaire |
| `timesheet.draft` | Info en dashboard |
| `timesheet.ready_for_signature` | Créer tâche de contrôle + signature |
| `timesheet.tacitly_validated` | Fallback si non-signature |
| `invoice.created` | Rapprocher avec facture agence à émettre |
| `invoice.paid` | MAJ encaissement |
| `partner.document.expiring` | Alerte au gestionnaire |
| `partner.suspended` | Stop push de dispos, alerte urgente |

### 5.4 Contrats de données (exemple POST worker availability)

```http
POST /api/v1/partners/{partnerId}/workers/{staffId}/availability HTTP/1.1
Host: api.moveplanner.ch
Authorization: Bearer {api_key}
Idempotency-Key: {uuid}
Content-Type: application/json

{
  "slots": [
    {
      "dateFrom": "2026-05-04T07:00:00+02:00",
      "dateTo": "2026-05-04T17:00:00+02:00",
      "status": "available"
    },
    {
      "dateFrom": "2026-05-05T07:00:00+02:00",
      "dateTo": "2026-05-05T17:00:00+02:00",
      "status": "unavailable",
      "reason": "Formation obligatoire SUVA"
    }
  ],
  "publishedAt": "2026-05-03T20:30:00+02:00",
  "ttlHours": 24
}
```

Réponse 200 :

```json
{
  "accepted": 2,
  "rejected": 0,
  "nextAvailabilityCheckAt": "2026-05-04T20:30:00+02:00"
}
```

### 5.5 Contrats de données (exemple réception webhook)

```http
POST /webhooks/moveplanner HTTP/1.1
Host: api.monagence.ch
Content-Type: application/json
X-MovePlanner-Event: worker.assignment.proposed
X-MovePlanner-Signature: sha256={hex}
X-MovePlanner-Timestamp: 1712345678
X-MovePlanner-Event-Id: {uuid}

{
  "eventType": "worker.assignment.proposed",
  "occurredAt": "2026-05-03T14:22:00+02:00",
  "assignmentRequestId": "ar_abc123",
  "partnerId": "ptn_456",
  "staffId": "stf_789",
  "missionId": "msn_xyz",
  "role": "mover",
  "mission": {
    "dateFrom": "2026-05-04T08:00:00+02:00",
    "dateTo": "2026-05-04T18:00:00+02:00",
    "originAddress": "Rue du Pont 4, 1003 Lausanne",
    "destinationAddress": "Route de Genève 12, 1260 Nyon",
    "clientName": "SA Déménagements Martin"
  },
  "expectedCompensationRappen": 24000,
  "confirmationDeadline": "2026-05-03T14:52:00+02:00",
  "shortLinkUrl": "https://m.moveplanner.ch/a/tk_abc",
  "fallbackRank": 1,
  "totalFallbacks": 5
}
```

### 5.6 Option MCP (Phase ultérieure)

MovePlanner exposera peut-être un serveur MCP. Dans ce cas, le système agence pourra intégrer ses tools directement dans un assistant IA interne (ex. pour que le gestionnaire demande en langage naturel : « Quelles missions MovePlanner à pourvoir cette semaine pour Jean Dupont ? »). Non prioritaire.

---

## 6. Stack technique suggérée

### 6.1 Choix par défaut (alignés avec MovePlanner pour faciliter les synergies)

| Couche | Techno recommandée | Alternative |
|--------|--------------------|-------------|
| Backend API | Node.js 20 + Express + TypeScript (strict) | NestJS si préférence framework riche |
| Base de données | PostgreSQL 16 hébergé en Suisse (Infomaniak, Exoscale) | Firestore si cohérence MovePlanner |
| ORM | Prisma | Drizzle, TypeORM |
| Frontend admin | Next.js 14 (App Router) + Tailwind + shadcn/ui | Remix |
| Portail intérimaire mobile | PWA Next.js (pas d'app native en MVP) | Flutter si cross-platform natif |
| Authentification | Firebase Auth multi-tenant OU Supabase Auth | Auth0 |
| Signature électronique | Swisscom Trust Signing Services OU SuisseID | Universign, Yousign |
| SMS | Swisscom Enterprise SMS OU Twilio | MessageBird |
| Paiements bancaires (ISO 20022) | Via PostFinance API OU UBS API | Swisspayment |
| Comptabilité | Intégration Abacus / Bexio (API natives) | Export CSV générique |
| Hébergement | **Suisse obligatoire** — Infomaniak Public Cloud, Exoscale, Swisscom Cloud | GCP europe-west6 (Zurich) avec validation juridique |
| CI/CD | GitHub Actions | GitLab CI |
| Monitoring | Sentry + Grafana Cloud | Datadog |

**Important — Hébergement** : pour la nLPD et la confiance clients, héberger en Suisse est fortement recommandé (pas obligatoire mais attendu). Infomaniak ou Exoscale sont 100% Suisse.

### 6.2 Modules backend suggérés

```
src/
  modules/
    workers/            # Gestion intérimaires
    clients/            # Gestion clients (dont MovePlanner)
    availabilities/     # Dispos + push vers clients
    proposals/          # Réception webhooks missions
    contracts/          # Contrats cadre + missions
    timesheets/         # Relevés d'heures
    payroll/            # Paie hebdo
    invoicing/          # Facturation QR-bill
    compliance/         # Conformité LSE/CCT
    integrations/
      moveplanner/      # Client API + webhook handler
      bexio/            # Export compta
      abacus/
      swisscom-sms/
    auth/
    shared/
      events/           # Pub/Sub ou BullMQ
      qr-bill/          # Générateur QR-facture
      iso20022/         # Virements bancaires
      elm/              # Échange électronique salaires
```

---

## 7. Phasage suggéré (~10-12 semaines)

| Sprint | Durée | Contenu | Livrable |
|--------|-------|---------|----------|
| **A.0** | 1 sem | Setup : monorepo, CI/CD, Docker, hébergement CH, auth | Infra prête |
| **A.1** | 2 sem | CRUD intérimaires + documents + alertes expiration + CRUD clients + contrats cadre | Back-office agence MVP |
| **A.2** | 2 sem | Disponibilités : saisie, calendrier, **push API vers MovePlanner** (client API + tests mocks) | Synchro dispos MP |
| **A.3** | 2 sem | **Webhooks MovePlanner** : réception, signature HMAC, mission_proposals, routage pass-through/contrôle | Intégration entrante |
| **A.4** | 2 sem | Contrats de mission (génération PDF + signature OTP), timesheets réception + signature/contestation | Cycle mission complet |
| **A.5** | 2-3 sem | Paie hebdo (calcul, bulletins, ELM), facturation QR-bill, export compta Bexio/Abacus | Paie + facturation live |
| **A.6** | 1 sem | Tableau de bord conformité, tests E2E, hardening sécu, go-live | Production ready |

---

## 8. Critères d'acceptation MVP

1. Je peux créer un intérimaire, uploader son permis B, attendre son expiration → alerte 30 j avant
2. Je déclare la dispo de Jean Dupont lundi 8h-17h → MovePlanner reçoit le POST et confirme
3. MovePlanner propose Jean Dupont sur une mission → je reçois le webhook → je vois la proposition dans mon dashboard
4. En mode pass-through : Jean reçoit un SMS de MovePlanner → il accepte → je reçois webhook `accepted` → mon système génère automatiquement le contrat de mission PDF et l'envoie à Jean par email + signature SMS OTP
5. MovePlanner envoie un relevé d'heures de Jean pour la semaine → je compare avec le planning, tout correct → je POST la signature → MovePlanner reçoit
6. Chaque vendredi 20h : paie Jean calculée, bulletin PDF généré, annonce ELM envoyée, virement ISO 20022 prêt
7. Chaque fin de mois : facture MovePlanner générée en QR-bill, envoyée par email → MovePlanner la reçoit et la rapproche
8. Mon autorisation cantonale LSE arrive à expiration dans 60j → alerte rouge en page d'accueil
9. Un contrôle SECO me demande la liste des missions actives → export en 1 clic

---

## 9. Risques et points d'attention

| Risque | Mitigation |
|--------|-----------|
| Évolution des barèmes CCT annuelle | Abonnement publications swissstaffing + batch import annuel des tables |
| Retard webhook MovePlanner → proposition expirée | File d'attente persistante + replay automatique |
| Signature électronique non recevable en cas de litige | Choisir fournisseur certifié ZertES (SuisseID, Swisscom) dès le MVP pour les contrats de mission |
| Dépendance forte à MovePlanner pour le CA | Le système doit être **multi-client** dès le départ (MovePlanner = 1er client mais pas l'unique) |
| Changement de contrat d'interface MP | Versioning strict `/api/v1/…` + tests de non-régression automatisés |
| Conformité nLPD — transferts de données | Pas de sous-traitant hors Suisse ; si besoin, DPA signé avec clauses de transfert |
| Hébergement hors Suisse mal perçu | Choix Infomaniak / Exoscale pour rassurer + mention « hébergé en Suisse » dans la communication |

---

## 10. Ressources utiles

- **swissstaffing** : https://www.swissstaffing.ch — association patronale, publications CCT
- **SECO** : https://www.seco.admin.ch — autorité fédérale service de l'emploi
- **PFPDT** : https://www.edoeb.admin.ch — préposé fédéral protection des données
- **Standard QR-bill** : https://www.paymentstandards.ch
- **Guide nLPD** : https://www.edoeb.admin.ch/fr/nlpd
- **Plan comptable PME suisse** : document Veb.ch

---

## 11. Prochaines étapes

1. **Valider ce brief** avec les parties prenantes (direction, CTO, juriste)
2. **Lancer une session Claude Code dédiée** : créer un nouveau projet (monorepo), coller ce brief dans `CLAUDE.md`, ajouter les skills utiles (backend, PostgreSQL, auth, Swiss compliance)
3. **Première tâche Claude** : « Initialise le monorepo selon la stack § 6, crée la structure de modules § 6.2 et le schéma Prisma pour les entités du § 4.1 »
4. **En parallèle** : déposer la demande d'autorisation cantonale LSE si l'agence n'en dispose pas encore

---

**Fin du brief — v1.0**

*Ce document est un brief de démarrage. Il est appelé à évoluer à mesure que les besoins se précisent et que le système MovePlanner lui-même se stabilise. Les mises à jour du contrat d'interface seront publiées par l'équipe MovePlanner dans `partners-interim-specification.md`.*
