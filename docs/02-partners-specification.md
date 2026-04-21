# MovePlanner — Spécification « Partenaires & Intérim »

> **Version** : 1.0
> **Date** : 2026-04-21
> **Statut** : Draft — à valider
> **Périmètre** : Société de déménagement (MovePlanner) uniquement — voir document complémentaire `interim-agency-system-brief.md` pour la partie agence d'intérim
> **Contexte juridique** : **Suisse** (Confédération helvétique)
> **Phase cible** : Phase 3 — Partenaires & Paie Externe (nouveaux prompts P.1 à P.4)

---

## 1. Objectif

Permettre à MovePlanner — plateforme de planification automatisée pour entreprises de déménagement — de :

1. **Intégrer dans son planning intelligent** les ressources externes (intérimaires et ouvriers de sous-traitants) en plus des salariés internes
2. **Gérer le cycle complet** de l'affectation d'un intérimaire : proposition → confirmation → mission → relevé d'heures → facturation
3. **Dialoguer par API** avec le système d'information d'une ou plusieurs agences d'intérim partenaires, ainsi qu'avec un portail web pour les sous-traitants
4. Respecter **le cadre légal suisse** (LTr, CO, LSE, CCT Location de services, nLPD, TVA 8.1%, swissstaffing)

Ce document **ne couvre pas** le développement du système côté agence d'intérim — celui-ci fait l'objet d'un document séparé `interim-agency-system-brief.md` et sera développé dans une session Claude Code indépendante.

---

## 2. Contexte réglementaire suisse

Toute l'implémentation doit tenir compte des spécificités suisses ci-dessous. Ces points sont non négociables et conditionnent le modèle de données.

### 2.1 Travail temporaire (intérim)

- **Loi sur le service de l'emploi (LSE)** et son ordonnance (OSE) : les agences de location de services doivent détenir une autorisation cantonale (et fédérale si activité internationale). MovePlanner doit vérifier cette autorisation au moment de l'onboarding d'un partenaire d'intérim et refuser toute collaboration si elle est absente ou expirée.
- **CCT Location de services** (étendue par le Conseil fédéral) : fixe les conditions minimales (salaires, durée du travail, vacances, 13ᵉ salaire) applicables aux intérimaires. Le système doit connaître la CCT applicable au secteur (déménagement / transport / logistique) et s'assurer que les taux horaires saisis respectent les minima de la branche.
- **Bulletin de salaire hebdomadaire** : en pratique, les agences d'intérim suisses fonctionnent avec un relevé d'heures hebdomadaire (`Arbeitsrapport`) signé par le client, transmis en milieu de semaine pour paie le vendredi. MovePlanner doit générer ce document au format accepté par **swissstaffing**.
- **Permis de travail** : L (courte durée), B (séjour), C (établissement), G (frontalier). À vérifier et à tracer pour chaque intérimaire.

### 2.2 Sous-traitance

- **Art. 5 LTN (Loi sur le travail au noir)** : responsabilité solidaire de l'entreprise contractante en cas de manquement du sous-traitant au paiement des salaires et charges sociales. Obligation de diligence.
- **Documents à vérifier (renouvellement ≤ 6 mois)** :
  - Extrait du registre du commerce
  - Attestation de non-poursuite (< 3 mois)
  - Attestation AVS/AI
  - Attestation LAA (SUVA ou assureur privé)
  - Attestation de prévoyance professionnelle (LPP)
  - Attestation de respect de la CCT de la branche
  - Assurance RC professionnelle (copie de police + attestation à jour)

### 2.3 Durée du travail (LTr)

- Durée maximale hebdomadaire : **50 h** pour le secteur bâtiment/déménagement (art. 9 LTr)
- Repos quotidien : 11 h consécutives
- Travail de nuit (23h-6h) : soumis à autorisation et majoration (25% au minimum)
- Travail du dimanche : généralement interdit, soumis à autorisation exceptionnelle, majoration 50%
- Heures supplémentaires : majoration **25% en espèces** sauf compensation en temps

### 2.4 Protection des données

- **nLPD** (nouvelle Loi fédérale sur la protection des données, en vigueur depuis sept. 2023) — largement équivalente au RGPD mais pas identique
- Registre des traitements obligatoire
- Consentement explicite pour toute donnée sensible (santé, infractions, opinions)
- Droit à l'information, à l'accès, à la rectification, à l'effacement
- Annonce de violation au PFPDT sous 72 h

### 2.5 Fiscalité et comptabilité

- **TVA suisse** : 8.1% taux normal (depuis 2024), 3.8% hébergement, 2.6% taux réduit
- **QR-facture** : obligatoire depuis le 01.10.2022. Pas de Factur-X / EN 16931 / ZUGFeRD comme en France
- **Plan comptable** : plan PME suisse (pas le PCG français)
- **Formats d'export comptable courants** : Abacus, Bexio, Sage 50 Suisse, swiss21. Pas de FEC
- **Monnaie** : CHF (base 100 = Rappen). Les montants sont stockés en **Rappen** (centimes) comme entiers

---

## 3. Architecture cible

### 3.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────┐
│                    ÉCOSYSTÈME MOVEPLANNER                │
│                                                          │
│  ┌─────────────────────┐      ┌────────────────────────┐ │
│  │   MovePlanner       │      │  Agence d'intérim      │ │
│  │   (ce document)     │◄────►│  (doc séparé)          │ │
│  │                     │ API  │                        │ │
│  │  - Planning         │ +    │  - Base intérimaires   │ │
│  │  - OR-Tools         │ MCP  │  - Dispos & affect.    │ │
│  │  - Missions         │      │  - Paie & facturation  │ │
│  │  - Timesheets       │      │    vers MovePlanner    │ │
│  │  - Portail ST       │      │                        │ │
│  └─────────────────────┘      └────────────────────────┘ │
│         ▲                                                │
│         │ Portail web                                    │
│         ▼                                                │
│  ┌─────────────────────┐                                 │
│  │  Sous-traitants     │                                 │
│  │  (petites ent.)     │                                 │
│  │  - Documents légaux │                                 │
│  │  - Dispos ouvriers  │                                 │
│  │  - Signature heures │                                 │
│  └─────────────────────┘                                 │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Acteurs

| Acteur | Rôle | Interface |
|--------|------|-----------|
| **Chef d'équipe MovePlanner** | Pointe son équipe en fin de journée (salariés + intérim + ST) | App mobile Flutter |
| **Commercial / Planificateur MovePlanner** | Crée les missions, supervise les affectations | Web React |
| **Intérimaire** | Reçoit une proposition de mission par SMS, accepte ou refuse | Page web mobile (pas d'app) |
| **Agence d'intérim** | Déclare ses intérimaires, reçoit les relevés d'heures | API + tableau de bord agence |
| **Sous-traitant (gérant)** | Déclare ses ouvriers, valide les heures | Portail web partenaire |
| **Comptable MovePlanner** | Valide et exporte les factures fournisseur | Web React |

### 3.3 Nouvelles entités de données

Toutes les entités nouvelles respectent les conventions du projet : `agencyId` multi-tenant, soft delete (`deletedAt`), timestamps Firestore, montants en **Rappen** (centimes CHF).

#### 3.3.1 `Partner` (partenaire)

```typescript
interface Partner {
  partnerId: string;
  agencyId: string;                    // Multi-tenant MovePlanner
  partnerType: 'temp_agency' | 'subcontractor';
  legalName: string;
  commercialName?: string;
  ideNumber: string;                   // Numéro IDE suisse (CHE-XXX.XXX.XXX)
  lseAuthorizationNumber?: string;     // Si temp_agency (obligatoire)
  lseAuthorizationExpiry?: string;     // ISO date
  vatNumber?: string;                  // Numéro TVA suisse
  canton: string;                      // Canton du siège
  address: Address;
  contacts: PartnerContact[];
  iban: string;
  bic?: string;
  status: 'onboarding' | 'active' | 'suspended' | 'archived';
  suspensionReason?: string;           // ex. "Document expiré"
  onboardedAt?: string;
  lastComplianceCheckAt?: string;
  nextComplianceCheckDueAt?: string;   // = dernière + 6 mois
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

#### 3.3.2 `PartnerDocument` (documents légaux)

```typescript
interface PartnerDocument {
  documentId: string;
  partnerId: string;
  agencyId: string;
  documentType:
    | 'rc_extract'
    | 'non_pursuit_certificate'
    | 'avs_ai_certificate'
    | 'laa_certificate'
    | 'lpp_certificate'
    | 'cct_compliance'
    | 'rc_pro_insurance'
    | 'lse_authorization'
    | 'kbis_equivalent'
    | 'other';
  gcsUri: string;                      // Cloud Storage (chiffré)
  issuedAt?: string;
  expiresAt?: string;                  // Surveillé pour alertes
  ocrExtractedData?: Record<string, any>;
  validatedBy?: string;                // userId MovePlanner
  validatedAt?: string;
  status: 'pending_validation' | 'valid' | 'expired' | 'rejected';
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}
```

#### 3.3.3 `PartnerContract` (contrat cadre)

```typescript
interface PartnerContract {
  contractId: string;
  partnerId: string;
  agencyId: string;
  contractNumber: string;              // Référence interne
  startDate: string;
  endDate?: string;                    // Null = CDI / durée indéterminée
  cctReference?: string;               // ex. "CCT Location de services - Transport"
  paymentTermDays: number;             // ex. 30 jours net
  billingFrequency: 'weekly' | 'monthly' | 'per_mission';
  // Pour temp_agency : coefficient multiplicateur appliqué au salaire horaire
  agencyCoefficient?: number;          // ex. 1.85 (salaire brut × 1.85 = coût MovePlanner)
  // Taux horaires par rôle (en Rappen/h)
  hourlyRates: {
    role: 'team_leader' | 'mover' | 'driver' | 'driver_c1' | 'driver_c' | 'driver_ce';
    baseRateRappen: number;
  }[];
  // Majorations
  surcharges: {
    type: 'night' | 'sunday' | 'holiday' | 'overtime';
    percent: number;                   // ex. 25 = +25%
  }[];
  signedPdfUri?: string;
  status: 'draft' | 'active' | 'terminated' | 'expired';
  createdAt: string;
  updatedAt: string;
}
```

#### 3.3.4 Extension de `Staff` (existant)

```typescript
// Champs ajoutés au modèle existant
interface Staff {
  // ... champs existants ...
  employmentType: 'employee' | 'temp_worker' | 'subcontractor_worker';
  partnerId?: string;                  // Obligatoire si employmentType != 'employee'
  workPermit?: {
    permitType: 'L' | 'B' | 'C' | 'G' | 'citizen';
    permitNumber?: string;
    expiresAt?: string;
  };
  avsNumber?: string;                  // N° AVS (13 chiffres)
  reliabilityScore?: number;           // 0-100, calculé (voir §6.4)
  // ... champs existants ...
}
```

#### 3.3.5 `WorkerAvailability` (disponibilité temps réel)

```typescript
interface WorkerAvailability {
  availabilityId: string;
  staffId: string;
  agencyId: string;
  dateFrom: string;                    // ISO datetime
  dateTo: string;                      // ISO datetime
  status: 'available' | 'tentative' | 'unavailable';
  source: 'internal' | 'temp_agency_api' | 'subcontractor_portal' | 'worker_self';
  sourceReference?: string;            // ID externe si API
  reason?: string;                     // "Maladie", "Autre mission", etc.
  freshness: 'realtime' | 'cached' | 'stale';
  lastUpdatedAt: string;
  ttlExpiresAt?: string;               // Après quoi = stale
}
```

#### 3.3.6 `AssignmentRequest` (workflow de confirmation)

```typescript
interface AssignmentRequest {
  requestId: string;
  missionId: string;
  agencyId: string;
  staffId: string;                     // Candidat choisi
  role: string;
  rolePosition: number;                // Position dans l'équipe (1er déménageur, 2e…)
  fallbackCandidateIds: string[];      // Ordonnés par score OR-Tools
  status:
    | 'proposed'
    | 'notified'
    | 'viewed'
    | 'accepted'
    | 'refused'
    | 'timeout'
    | 'cancelled'
    | 'replaced';
  notificationChannels: ('sms' | 'email' | 'push')[];
  notifiedAt?: string;
  viewedAt?: string;
  respondedAt?: string;
  responseReason?: string;             // Si refus
  confirmationDeadline: string;        // ISO datetime
  confirmationDeadlineMinutes: number; // Copie du paramètre au moment T
  expectedCompensationRappen: number;
  missionSnapshot: {                   // Gel des infos mission pour notification
    dateFrom: string;
    dateTo: string;
    originAddress: string;
    destinationAddress: string;
    clientName: string;
    roleLabel: string;
  };
  shortLinkToken: string;              // Token pour URL courte /a/{token}
  createdAt: string;
  updatedAt: string;
}
```

#### 3.3.7 `Timesheet` (relevé d'heures)

```typescript
interface Timesheet {
  timesheetId: string;
  agencyId: string;
  staffId: string;
  partnerId?: string;                  // Null si salarié interne
  missionId: string;
  workDate: string;                    // ISO date (YYYY-MM-DD)
  plannedStart: string;                // ISO datetime (prévu)
  plannedEnd: string;
  actualStart?: string;                // Saisi par chef d'équipe
  actualEnd?: string;
  breakMinutes: number;                // Pauses décomptées
  productiveMinutes: number;           // Calculé
  surchargesApplied: {
    type: 'night' | 'sunday' | 'holiday' | 'overtime';
    minutes: number;
    percent: number;
  }[];
  totalCostRappen: number;             // Calculé depuis PartnerContract
  status:
    | 'planned'
    | 'team_leader_validated'
    | 'sent_to_partner'
    | 'partner_signed'
    | 'partner_disputed'
    | 'tacitly_validated'
    | 'invoiced'
    | 'cancelled';
  teamLeaderStaffId?: string;
  teamLeaderComment?: string;
  teamLeaderValidatedAt?: string;
  partnerSignedBy?: string;
  partnerSignedAt?: string;
  partnerSignatureUri?: string;        // PDF signé
  disputeReason?: string;
  tacitValidationAt?: string;          // Validation tacite après 7j
  incidentReport?: string;
  createdAt: string;
  updatedAt: string;
}
```

#### 3.3.8 `PartnerInvoice` (facture d'achat)

```typescript
interface PartnerInvoice {
  invoiceId: string;
  agencyId: string;
  partnerId: string;
  invoiceNumber: string;               // Séquentiel interne
  periodFrom: string;
  periodTo: string;
  timesheetIds: string[];              // Relevés agrégés
  lines: {
    staffId: string;
    staffName: string;
    workDate: string;
    minutes: number;
    rateRappen: number;
    surcharges: { type: string; amountRappen: number }[];
    lineTotalRappen: number;
  }[];
  subtotalRappen: number;
  vatRateBp: number;                   // Basis points (810 = 8.1%)
  vatAmountRappen: number;
  totalRappen: number;
  currency: 'CHF';
  qrBillPayload?: string;              // Payload QR-bill si le partenaire émet
  status:
    | 'draft'
    | 'pending_partner_invoice'        // On attend la facture officielle
    | 'received_from_partner'
    | 'reconciled'                     // Rapprochée avec facture partenaire
    | 'disputed'
    | 'approved'
    | 'paid'
    | 'cancelled';
  dueDate: string;
  paidAt?: string;
  paidAmountRappen?: number;
  exportedAccountingAt?: string;
  accountingReference?: string;        // Référence dans Abacus/Bexio
  createdAt: string;
  updatedAt: string;
}
```

---

## 4. Suivi de disponibilité en temps réel

### 4.1 Sources et consolidation

Le moteur de planning OR-Tools interroge **une seule source** — la collection Firestore `worker_availabilities` — plutôt que d'appeler les API externes en temps réel (ce qui bloquerait l'optimisation).

Cette collection est alimentée en temps réel par trois flux :

1. **Interne MovePlanner** : déclencheurs Firestore sur `missions` et `staff.status` pour marquer automatiquement indisponibles les personnes affectées ou en congé.
2. **Push depuis les agences d'intérim** : endpoint `POST /api/v1/partners/{partnerId}/workers/{staffId}/availability` qui accepte une liste de créneaux. L'agence appelle cette API à chaque changement OU sur planning quotidien (cron 4h du matin).
3. **Portail sous-traitant** : le gérant déclare pour chacun de ses ouvriers les jours disponibles via un calendrier hebdomadaire.

### 4.2 Gestion de la fraîcheur (TTL)

Chaque enregistrement porte un champ `freshness` et un `ttlExpiresAt`. Si une source de push n'a pas confirmé la disponibilité depuis **30 min** (paramétrable), le statut passe de `realtime` à `cached`. Après **24 h sans refresh** il passe à `stale` — le moteur OR-Tools l'ignore ou applique une pénalité.

Une Cloud Function planifiée (toutes les 5 min) parcourt la collection et met à jour les statuts de fraîcheur + envoie des alertes au manager si trop de partenaires sont en `stale`.

### 4.3 Événements Pub/Sub

- `availability.updated` (push source → cache)
- `availability.stale` (alerte ops)
- `worker.unavailable_reported` (pour recalcul OR-Tools de missions en cours)

---

## 5. Workflow d'affectation avec confirmation automatique

### 5.1 Machine à états de l'`AssignmentRequest`

```
[proposed] ──notifications envoyées──► [notified]
                                       │
                         worker clique le lien
                                       ▼
                                    [viewed]
                                       │
                     ┌─────────────────┼──────────────────┐
                     ▼                 ▼                  ▼
                [accepted]        [refused]      deadline passée
                     │                 │                  ▼
                     │                 │             [timeout]
                     │                 │                  │
                     │                 └──────┬───────────┘
                     │                        ▼
                     │               bascule candidat suivant
                     │                        │
                     │              nouveau AssignmentRequest
                     │               (statut [proposed])
                     ▼
            équipe complète ?
                     │
              oui ──► mission CONFIRMÉE
              non ──► en attente autres postes
```

### 5.2 Notification (canal SMS + lien web)

- **Canal primaire : SMS** via passerelle (Swisscom Enterprise SMS ou Twilio). Le message contient nom du client, ville origine → destination, date, créneau horaire, taux horaire prévu, URL courte signée (`https://m.moveplanner.ch/a/{token}`).
- **Canal secondaire : email** envoyé en parallèle (même lien).
- **Pas d'app obligatoire** pour l'intérimaire — il accède à la page mobile web via le lien.

Structure du message SMS (≤ 160 caractères recommandé) :

```
MovePlanner: mission {date} {ville_A} → {ville_B}, {créneau}, {taux}/h.
Accepter/Refuser avant {heure_limite}: https://m.moveplanner.ch/a/{token}
```

### 5.3 Page web d'acceptation

Page responsive minimaliste (SSR Next.js ou static + API call) :

- Détails complets : date, lieu, client, rôle, taux, durée, majorations éventuelles, contact du chef d'équipe
- Adresse du point de rendez-vous avec lien Google Maps / Swisstopo
- Deux boutons : **Accepter** / **Refuser** (avec raison optionnelle)
- Après action, confirmation affichée + SMS de confirmation envoyé
- Token unique à usage unique (invalidé après réponse ou expiration)

### 5.4 Délai de confirmation — paramètre configurable

Paramètre stocké en base par agence MovePlanner :

```typescript
interface AgencySettings {
  confirmationDeadlineMinutes: number;          // Défaut : 30
  confirmationDeadlineOverrideByUrgency?: {
    sameDay: number;                            // ex. 15
    nextDay: number;                            // ex. 60
    laterThan48h: number;                       // ex. 120
  };
  maxFallbackAttempts: number;                  // Défaut : 5
  fallbackIntervalMinutes: number;              // Défaut : 5 (laisse 5 min entre 2 tentatives)
}
```

Modifiable dans l'interface admin `/settings/assignments` par le rôle `agency_admin`. Valeurs par défaut initialisées à la création de l'agence.

### 5.5 Bascule automatique (fallback)

Déclenchée par :

- **Refus explicite** : basculement immédiat au candidat suivant
- **Timeout** : Cloud Scheduler (ou Cloud Tasks) planifié au moment `confirmationDeadline`. Si statut toujours `notified`, passage au candidat suivant.

Le `fallbackCandidateIds[]` a été calculé par OR-Tools au moment de la génération de la proposition. La liste peut contenir des intérimaires de **plusieurs agences** différentes, et même des salariés internes en dernier recours (overtime).

Si tous les candidats sont épuisés → événement `mission.staffing_failed` → escalade au commercial (SMS + notification push dans l'app MovePlanner).

### 5.6 Gestion des postes multiples

Une mission peut nécessiter `n` personnes (ex. 1 chef d'équipe + 3 déménageurs + 1 chauffeur C1). Un `AssignmentRequest` est créé par poste. La mission n'est déclarée `fully_staffed` que quand tous les postes sont `accepted`. Le moteur OR-Tools peut **réoptimiser** la couverture si un poste est en `timeout` répété : il peut proposer un changement de profil (ex. 4 déménageurs au lieu de 3 si on trouve personne avec le permis C1, en acceptant une pénalité).

---

## 6. Génération automatique des feuilles d'horaires

### 6.1 Mode prédictif

Dès qu'une mission passe en `fully_staffed`, un batch crée automatiquement une `Timesheet` en statut `planned` pour chaque intérimaire/ouvrier ST affecté, avec les horaires théoriques (début/fin de mission) et le calcul prévisionnel du coût.

### 6.2 Mode ajustement réel (chef d'équipe)

À la fin de chaque journée de mission, le chef d'équipe ouvre dans l'app mobile (Flutter) l'écran `Pointage du jour`. Il voit la liste complète de son équipe (salariés + intérim + ST mélangés, distingués visuellement) et pour chaque personne :

- Heure d'arrivée effective
- Heure de fin effective
- Pauses (minutes)
- Majorations éventuelles : nuit, dimanche, heures sup (cases à cocher)
- Commentaire libre / incident

Il valide l'ensemble → tous les `Timesheet` passent en `team_leader_validated`. Un double-check backend recalcule le `totalCostRappen` à partir du `PartnerContract` en vigueur.

### 6.3 Génération hebdomadaire du relevé signable

Cloud Scheduler job : chaque vendredi 18h (configurable par agence) :

1. Agrège par **partenaire** tous les `Timesheet` en statut `team_leader_validated` de la semaine
2. Génère un PDF au format **swissstaffing** (1 PDF par partenaire, 1 section par intérimaire) contenant :
   - En-tête : logo MovePlanner, IDE partenaire, période
   - Tableau : date / chantier / heures planifiées / heures réelles / pauses / total / majorations / signature chef
   - Total hebdomadaire par intérimaire
   - Zone de signature partenaire
3. Dépose le PDF dans Cloud Storage (`gs://moveplanner-timesheets/{agencyId}/{partnerId}/{weekISO}.pdf`)
4. Envoie au partenaire via l'interface appropriée (voir §7.4 pour temp_agency API, §8 pour sous-traitants portail)
5. Fait passer chaque `Timesheet` en statut `sent_to_partner`

### 6.4 Calcul du `reliabilityScore`

Score 0-100 attribué à chaque `Staff` externe, recalculé chaque semaine :

- Pondération taux d'acceptation des propositions (30%)
- Pondération ponctualité (début de mission) (25%)
- Pondération durée réelle vs planifiée (20%)
- Pondération absence d'incident / dispute (15%)
- Pondération note du chef d'équipe (10%)

Utilisé comme signal par OR-Tools pour prioriser les profils fiables dans le ranking des candidats.

---

## 7. Interface API / MCP avec les agences d'intérim

> **Rappel** : le système côté agence d'intérim n'est pas développé dans ce projet. Voir `interim-agency-system-brief.md`. Cette section définit le **contrat d'interface** que MovePlanner expose et consomme.

### 7.1 Principes

- **REST JSON** pour l'interactif synchrone
- **Webhooks** pour les notifications asynchrones
- **mTLS** obligatoire + **clé API** par partenaire (rotation 90 j)
- **HMAC-SHA256** sur tous les webhooks (header `X-MovePlanner-Signature`)
- **Versioning** : préfixe `/api/v1/…`
- **Idempotence** : header `Idempotency-Key` obligatoire sur les POST/PUT
- **Limites** : 100 req/min par partenaire, 1000 req/jour (configurables)

### 7.2 Endpoints exposés par MovePlanner (appelés par l'agence d'intérim)

| Méthode | Endpoint | Usage |
|---------|----------|-------|
| `POST` | `/api/v1/partners/{partnerId}/workers` | Déclarer / mettre à jour un intérimaire |
| `DELETE` | `/api/v1/partners/{partnerId}/workers/{staffId}` | Retirer un intérimaire |
| `POST` | `/api/v1/partners/{partnerId}/workers/{staffId}/availability` | Publier disponibilités |
| `POST` | `/api/v1/partners/{partnerId}/workers/{staffId}/unavailable` | Marquer indispo immédiate |
| `POST` | `/api/v1/partners/{partnerId}/assignments/{requestId}/response` | Confirmer accept/refus au nom de l'intérimaire (si l'agence préfère centraliser) |
| `POST` | `/api/v1/partners/{partnerId}/timesheets/{timesheetId}/sign` | Signer un relevé hebdomadaire |
| `POST` | `/api/v1/partners/{partnerId}/timesheets/{timesheetId}/dispute` | Contester un relevé |
| `GET` | `/api/v1/partners/{partnerId}/timesheets` | Lister relevés par période |
| `GET` | `/api/v1/partners/{partnerId}/assignments` | Lister affectations passées/en cours |
| `GET` | `/api/v1/partners/{partnerId}/invoices` | Lister factures d'achat |

### 7.3 Webhooks envoyés par MovePlanner à l'agence

| Événement | Payload principal |
|-----------|-------------------|
| `worker.assignment.proposed` | Avant envoi au worker, l'agence peut bloquer |
| `worker.assignment.accepted` | Confirmation de mission |
| `worker.assignment.refused` | Refus par le worker |
| `worker.assignment.timeout` | Pas de réponse dans le délai |
| `worker.assignment.replaced` | Intérimaire remplacé en cours de mission |
| `timesheet.draft` | Généré à la fin de journée |
| `timesheet.ready_for_signature` | Relevé hebdo prêt |
| `timesheet.tacitly_validated` | Validation tacite (pas de retour après 7j) |
| `invoice.created` | Facture d'achat générée |
| `invoice.paid` | Paiement effectué |
| `partner.document.expiring` | Document légal arrive à expiration (30j avant) |
| `partner.suspended` | Partenaire suspendu (document manquant) |

### 7.4 MCP (Model Context Protocol) — optionnel, Phase 4+

Un serveur MCP MovePlanner pourra être exposé permettant à l'agence d'intérim d'utiliser un assistant IA (Claude, ChatGPT) pour interagir. Tools à exposer :

- `search_available_missions` — quelles missions MovePlanner cherche des intérimaires
- `list_my_workers_timesheets` — relevés de mes intérimaires
- `confirm_assignment_on_behalf` — confirmer au nom d'un intérimaire
- `get_worker_reliability_score` — score de fiabilité calculé par MovePlanner
- `propose_alternative_worker` — proposer un autre intérimaire pour une mission refusée

Implémentation : serveur MCP en Node.js, utilisant la même authentification mTLS + clé API que l'API REST.

### 7.5 Fiche technique d'authentification

```yaml
Transport: HTTPS obligatoire, TLS 1.3
Authentication:
  - mTLS : certificat client émis par MovePlanner à l'onboarding
  - API key : header Authorization: Bearer {key}
  - Rotation : tous les 90 jours, grace period 7j
Webhooks:
  - Signature : HMAC-SHA256 sur raw body, secret partagé, rotation 90j
  - Header : X-MovePlanner-Signature: sha256={hex}
  - Header : X-MovePlanner-Timestamp: {epoch_s}
  - Tolérance : ±5 min pour éviter replay
  - Retry : 3 tentatives avec backoff exponentiel (1s, 30s, 15 min)
Rate limit:
  - 100 req/min par partnerId
  - 1000 req/jour par partnerId
  - Header de réponse X-RateLimit-Remaining
```

---

## 8. Portail web pour sous-traitants

### 8.1 Vue d'ensemble

Sous-domaine dédié : `partners.moveplanner.ch` — application Next.js séparée de l'app MovePlanner principale.

Authentification Firebase Auth **avec tenant séparé** (Identity Platform multi-tenant) pour isoler complètement les comptes partenaires des comptes utilisateurs MovePlanner.

### 8.2 Parcours d'onboarding

1. MovePlanner crée le `Partner` (partnerType = `subcontractor`) et envoie une invitation email au gérant
2. Le gérant active son compte, crée le premier admin de son équipe
3. Il remplit le profil société (coordonnées, IBAN, IDE)
4. Il dépose les documents légaux obligatoires (voir §2.2) — l'upload déclenche un pipeline OCR qui extrait les dates d'expiration et pré-remplit le formulaire de validation
5. Après validation par un admin MovePlanner, le partenaire passe en statut `active`

### 8.3 Fonctionnalités

| Écran | Fonction |
|-------|----------|
| Dashboard | Missions à venir, relevés à signer, factures, alertes documents |
| Documents | Dépôt / consultation / renouvellement, alertes d'expiration |
| Équipe | CRUD des ouvriers de l'entreprise (ce sont des `Staff` avec employmentType = `subcontractor_worker`) |
| Disponibilités | Calendrier hebdo par ouvrier |
| Missions | Liste missions confiées + possibilité de réassigner ses propres ouvriers |
| Relevés | Signature électronique (dessin tactile ou SMS OTP), contestation |
| Factures | Consultation + téléchargement PDF / QR-bill |
| Paramètres | Profil, utilisateurs, notifications |

### 8.4 Signature électronique

Implémentation simple mais légalement recevable en Suisse (signature électronique simple selon SCSE) :

- Identification préalable (login + éventuellement 2FA SMS)
- Affichage du document complet
- Case à cocher d'acceptation
- Tracé tactile OU code OTP SMS
- Horodatage RFC 3161 via service tiers (ex. Swiss Post, SuisseID)
- Stockage du PDF signé + preuves d'identification dans GCS (chiffré, conservation 10 ans)

---

## 9. Facturation automatique et export comptable

### 9.1 Génération des `PartnerInvoice`

Batch déclenché automatiquement selon la `billingFrequency` du `PartnerContract` :

- `weekly` : chaque lundi 6h (pour la semaine écoulée)
- `monthly` : le 1er de chaque mois
- `per_mission` : à la clôture de chaque mission

Agrège tous les `Timesheet` en statut `partner_signed` ou `tacitly_validated` du partenaire sur la période.

### 9.2 Cas 1 — Le partenaire émet la facture (cas usuel intérim)

MovePlanner génère un **récapitulatif** que le partenaire valide, puis le partenaire émet sa propre facture (QR-bill). MovePlanner stocke la référence, rapproche automatiquement la facture reçue avec le récapitulatif (montants, période, heures), signale les écarts au comptable.

### 9.3 Cas 2 — MovePlanner émet la facture d'achat (auto-facturation)

Si clause d'auto-facturation au contrat (cas possible avec petits ST) : MovePlanner émet la facture au nom du partenaire, génère un PDF avec QR-bill, l'envoie au partenaire pour accord. Nécessite mandat écrit du partenaire (stocké dans `PartnerDocument`).

### 9.4 Export comptable

Formats supportés en sortie (configurable par agence) :

- **Abacus** (import via API Abacus / fichier CSV)
- **Bexio** (via API REST Bexio)
- **Sage 50 Suisse** (fichier XML)
- **swiss21** (API)
- **Générique** : CSV selon schéma Swiss GAAP RPC
- **Journal PDF** (comptabilité papier)

Comptes comptables utilisés (plan PME suisse) :

- **5200** — Charges de personnel temporaire (intérim)
- **4400** — Charges de sous-traitance
- **1106** — Créances envers fournisseurs (pour QR-bill entrants)
- **2000** — Créanciers (fournisseurs)
- **1170** — TVA récupérable

### 9.5 Rapprochement bancaire

À la réception d'un paiement bancaire (via CAMT.053 ou API Bridge équivalent suisse type Klarna XS2A / Swisspayment) :

- Matching automatique par référence QR-bill (QRR)
- Fallback : matching par montant + IBAN partenaire
- Validation manuelle si écart < 1 CHF (erreur d'arrondi tolérée)

---

## 10. Intégration au moteur d'optimisation OR-Tools

### 10.1 Changements dans le modèle CP-SAT (apps/optimizer)

Variables ajoutées :

- `x[mission, staff]` : booléen — staff affecté à la mission (existe déjà)
- `cost[mission, staff]` : coût associé (nouveau calcul : voir §10.2)
- `availability[staff, date]` : booléen, alimenté depuis `worker_availabilities`
- `is_external[staff]` : booléen — 1 si intérim ou ST

Contraintes ajoutées :

- **Document vérification** : un staff externe dont le `Partner` a un document expiré → `x[*, staff] = 0`
- **Permis valide** : `workPermit.expiresAt > mission.dateTo` sinon pas d'affectation
- **Durée max** : somme heures sur la semaine ≤ 50 h (LTr)
- **Repos 11h** : entre deux missions, ≥ 11 h

### 10.2 Fonction objectif (multi-critères)

```
minimize:
    Σ cost[mission, staff] × x[mission, staff]
  + α × (nombre_intérim_utilisés - seuil_préférence_interne)
  + β × pénalité_bascule_fallback
  + γ × (1 - reliabilityScore[staff]) × x[mission, staff]

sous contraintes :
    couverture de chaque poste de chaque mission
    disponibilité
    compatibilité compétences
    respect LTr
    respect des seuils d'heures par partenaire (clause contractuelle)
```

Le paramètre `α` (pénalité d'usage d'externes) est configuré par agence selon sa stratégie. Valeur par défaut : forte (= « salariés d'abord »).

### 10.3 Fallback list — calcul

Pour chaque poste de chaque mission, OR-Tools calcule **top-K candidats** (K=5 par défaut) triés par coût pondéré croissant. La liste est sérialisée dans `AssignmentRequest.fallbackCandidateIds`.

### 10.4 Réoptimisation partielle

Quand une mission a un poste en statut `timeout` après N candidats consommés, le moteur relance une optimisation **partielle** (uniquement sur les postes non couverts) en retirant les candidats déjà refusés et en élargissant les critères (ex. accepter un profil sur-qualifié avec overtime).

---

## 11. Paramètres configurables (UI admin)

Exposés dans `/settings` pour le rôle `agency_admin` :

| Paramètre | Défaut | Description |
|-----------|--------|-------------|
| `confirmationDeadlineMinutes` | 30 | Délai de réponse intérimaire |
| `confirmationDeadlineByUrgency` | J:15, J+1:60, J+2+:120 | Délais adaptatifs |
| `maxFallbackAttempts` | 5 | Nombre max de bascules auto |
| `fallbackIntervalMinutes` | 5 | Espacement entre bascules |
| `timesheetGenerationDayOfWeek` | 5 (vendredi) | Jour de génération hebdo |
| `timesheetGenerationTime` | 18:00 | Heure de génération hebdo |
| `tacitValidationDelayDays` | 7 | Délai de validation tacite |
| `documentExpiryAlertDays` | 30 | Jours avant expiration pour alerter |
| `availabilityStaleDelayMinutes` | 30 | Délai avant `cached` → `stale` |
| `staffingPreferenceWeight` | 0.7 | α de la fonction objectif (0=coût pur, 1=interne strict) |
| `smsProvider` | `swisscom` | ou `twilio` |
| `smsFromNumber` | (agence) | Numéro émetteur SMS |
| `portalSubdomain` | `partners.moveplanner.ch` | Domaine portail ST |
| `accountingExportFormat` | `bexio` | Abacus / Bexio / Sage / swiss21 / CSV |

---

## 12. Sécurité et conformité

### 12.1 Isolation multi-tenant

- Toutes les collections Firestore portent `agencyId` en clé de partition
- Règles Firestore : `request.auth.token.agencyId == resource.data.agencyId`
- Aucun partage transversal entre agences MovePlanner

### 12.2 Chiffrement des documents

- Bucket GCS dédié `gs://moveplanner-partner-docs-{agencyId}`
- CMEK (Customer Managed Encryption Keys) via Cloud KMS, rotation 90j
- URL signées pour téléchargement (15 min)

### 12.3 Journalisation nLPD / audit

Collection `audit_logs` (append-only) enregistrant :

- Création/modification/suppression de `Partner`, `PartnerDocument`, `PartnerContract`
- Toute signature de `Timesheet`
- Toute consultation de documents légaux par un utilisateur MovePlanner
- Tout appel API externe (qui, quand, quoi)
- Conservation 10 ans (obligation légale)

### 12.4 Privacy by design

- Minimisation : on ne demande que les données strictement nécessaires
- Pseudonymisation dans les logs applicatifs (pas de nom complet)
- Droit à l'oubli : soft delete + anonymisation après période légale

### 12.5 Registre des traitements

Document `docs/compliance/registre-traitements-partners.md` à maintenir à jour, mentionnant :

- Finalité du traitement
- Données traitées (intérimaires, ST, salariés)
- Destinataires (agence d'intérim, portail ST, cabinet comptable)
- Durée de conservation
- Mesures de sécurité
- Transferts hors Suisse (a priori : aucun)

---

## 13. Phasage — 4 sprints (~9 semaines)

| Sprint | Durée | Contenu | Livrables |
|--------|-------|---------|-----------|
| **P.1 — Fondations Partenaires** | 2 sem | Modèle `Partner`, `PartnerDocument`, `PartnerContract`, extension `Staff`, CRUD admin, migrations, seeds | API CRUD + écrans admin MovePlanner + migration Firestore |
| **P.2 — Workflow Confirmation** | 2 sem | `AssignmentRequest`, notifications SMS, page web accept/refus, fallback auto, intégration OR-Tools (contraintes + ranking) | Workflow E2E testable, paramètres UI |
| **P.3 — Timesheets & Mobile** | 2 sem | `Timesheet`, écran mobile chef d'équipe, génération PDF swissstaffing, envoi hebdo | App mobile mise à jour, PDF hebdo automatisé |
| **P.4 — Portail ST & Facturation** | 3 sem | Portail `partners.moveplanner.ch`, signature élec, `PartnerInvoice`, export Bexio/Abacus, rapprochement bancaire | Portail en prod, facturation complète, export compta |

**Total : ~9 semaines / 2 devs + 1 PO**.

Sprint supplémentaire (P.5) optionnel pour la surcouche MCP et intégrations poussées (Pixid-equivalent si un acteur suisse émerge).

---

## 14. Prompts Claude Code (à ajouter à `PROMPTS.md`)

Voir fichier `prompts-partners-interim.md` (dans ce même dossier) pour les prompts P.1 à P.4 prêts à coller dans Claude Code, en cohérence avec la structure existante de `PROMPTS.md`.

---

## 15. Critères d'acceptation (tests fonctionnels)

1. **Onboarding partenaire** : je peux créer une agence d'intérim, uploader son autorisation LSE, la faire passer en `active`. Document expiré → suspension automatique.
2. **Ajout intérimaire via API** : l'agence d'intérim POST un worker → je le retrouve dans MovePlanner avec `employmentType = temp_worker`.
3. **Déclaration dispo temps réel** : l'agence déclare 8h-17h le 2026-05-04 → OR-Tools voit la dispo dans l'optimisation exécutée à 23h59 le 2026-05-03.
4. **Affectation et confirmation** : je crée une mission, OR-Tools propose un intérimaire, SMS envoyé, je clique Accepter depuis le navigateur mobile → statut mission passe à `partially_staffed` puis `fully_staffed` quand tous les postes sont remplis.
5. **Bascule fallback** : je ne clique pas dans les 30 min → nouvelle proposition au candidat #2 automatiquement.
6. **Pointage chef équipe** : le chef saisit les heures réelles sur mobile → `Timesheet` passe à `team_leader_validated`.
7. **Génération hebdo** : le vendredi 18h, un PDF swissstaffing est déposé dans GCS et envoyé à l'agence via webhook.
8. **Signature partenaire** : l'agence POST signature → `Timesheet` passe à `partner_signed`.
9. **Facturation** : le lundi suivant, une `PartnerInvoice` est créée en statut `draft` avec toutes les lignes, puis `pending_partner_invoice`.
10. **Export compta** : le comptable exporte vers Bexio → les écritures apparaissent dans Bexio avec les bons comptes.
11. **Alerte document expirant** : 30 jours avant expiration d'une attestation AVS → email au partenaire + webhook.
12. **Conformité LTr** : OR-Tools refuse d'affecter un worker au-delà de 50h/semaine, même si disponible.

---

## 16. Glossaire

| Terme | Définition |
|-------|------------|
| **AssignmentRequest** | Demande d'affectation envoyée à un intérimaire, avec workflow d'acceptation |
| **CCT** | Convention collective de travail (Suisse) |
| **IBAN / QR-bill** | Standard de facturation suisse depuis 2022 |
| **IDE** | Identifiant des entreprises suisse (CHE-XXX.XXX.XXX) |
| **LAA** | Loi sur l'assurance-accidents (Suisse) |
| **LPP** | Loi sur la prévoyance professionnelle (Suisse) |
| **LSE** | Loi fédérale sur le service de l'emploi et la location de services |
| **LTr** | Loi fédérale sur le travail |
| **LTN** | Loi fédérale contre le travail au noir |
| **nLPD** | Nouvelle Loi sur la protection des données (Suisse) |
| **Rappen** | Centime de franc suisse |
| **SCSE** | Loi sur la signature électronique (Suisse) |
| **swissstaffing** | Association patronale des agences d'intérim en Suisse (standards de facturation) |

---

**Fin du document — v1.0**
