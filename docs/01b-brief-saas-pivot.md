# Brief — Pivot SaaS Helvètia Intérim (complément à 01-brief.md)

> **Version** : 1.0 — 2026-04-23
> **Statut** : complément non-destructif au brief initial
> **Décision** : voir `docs/adr/0006-saas-pivot.md`

Ce document **complète** — ne remplace pas — `docs/01-brief.md`. Le brief initial reste la vérité pour la phase 1 (pilote agence). Ce document pose la vérité pour la phase 2 (SaaS).

---

## Vision post-pilote

Transformer le SI construit pour une agence unique en **plateforme SaaS pour l'ensemble des agences de travail temporaire en Suisse**, éditée par `Helvètia Intérim SA` (entité juridique distincte à créer).

## Proposition de valeur (positionnement commercial)

**Pour les agences d'intérim CH** :

> "Le seul SI suisse natif pour agences d'intérim, intégré API avec les plateformes de planification clients (MovePlanner, etc.), conforme LSE/CCT/nLPD sans effort, hébergé en Suisse, prêt à l'emploi en 48 h."

**Différenciateurs** :

1. **Natif suisse** : Rappen, AVS/IDE/IBAN, cantons, CCT Location de services, ELM Swissdec — vs Pixid/Armado/PeoplePlanner qui sont nés sur le marché FR et jamais adaptés en profondeur.
2. **Intégration par API avec plateformes de planification clients** : MovePlanner d'abord, ouverture à d'autres à terme. La plupart des outils concurrents n'intègrent qu'en export CSV.
3. **Multi-tenant strict + white-label disponible** : chaque agence est isolée, peut customiser son branding, son sous-domaine, ses documents.
4. **Conformité embarquée** : refus automatique des taux < minimum CCT, alertes permis/LSE, audit logs append-only 10 ans, export SECO en 1 clic.
5. **Prix abordable PME** : à partir de 199 CHF/mois tout compris (vs 500-1500 CHF/mois chez les leaders français).

## Segments cibles (ordre décroissant d'effort)

### Cible #1 — Agences d'intérim suisses (70% effort)

- Taille : PME 2-30 ETP, 20-200 intérimaires placés simultanément.
- Localisation : CH Romande d'abord (VD/GE/FR/VS/NE/JU), CH alémanique phase 2.
- Pain points : outils FR mal adaptés CH, Excel, double-saisie MP↔compta, compliance LSE/CCT coûteuse.
- Volume cible : 20 agences payantes à M+12, 80 à M+24.

### Cible #2 — White-label via MovePlanner (20% effort)

- MovePlanner revend en marque blanche à ses 50-100 partenaires intérim.
- Revenue share avec MP.
- Un seul deal à signer, gros impact cash-flow.

### Cible #3 — PME opératrices de pools (10% effort opportuniste)

- Grandes PME BTP/déménagement/event qui gèrent en interne un pool de temporaires sans agence externe.
- Features simplifiées (salariés directs, pas de tri-partite LSE).
- Pricing entrée de gamme 99 CHF/mois.

## Modèle de tarification (draft, à valider post-pilote)

### Plan Starter — 199 CHF/mois
- 1 agence, 3 utilisateurs max, 20 intérimaires actifs max.
- Toutes features core : workers, clients, dispos, propositions, contrats, timesheets, paie, facturation QR-bill.
- Support email < 48h.
- Hébergement CH, conformité de base.

### Plan Pro — 499 CHF/mois
- 1 agence, 10 utilisateurs max, 100 intérimaires actifs max.
- Toutes features + intégrations (MovePlanner API, Bexio, ELM Swissdec, Swisscom SMS, Signature ZertES).
- Support email + chat < 8h ouvrées.
- Audit logs export, custom branding basique.

### Plan Enterprise — sur devis
- 1 agence ou groupe multi-filiales, utilisateurs et intérimaires illimités.
- Custom domain `app.nomagence.ch`, intégrations sur mesure, SLA 4h.
- DPA négociable, pentest annuel partagé.

### Add-ons
- SMS volume pack (au-delà de 500 SMS/mois) : variable.
- Signatures ZertES qualifiées : pass-through 1-3 CHF/signature.
- White-label complet (pour MP) : à négocier.
- Onboarding assisté 1-1 : 1500 CHF forfait premier mois.

## Ce qui change dans l'architecture et les opérations

### Architecture technique
- **Peu** : l'hexagonal + multi-tenant est déjà en place.
- **Ajouts** : landing publique, signup self-service, billing Stripe, webhooks Stripe, tenant provisioning backend, white-label theming, custom domains.
- **Durcissements** : audit staff éditeur (accès aux données tenants), tests de fuite cross-tenant exhaustifs (pas 5 scénarios, 50), rate limits par tenant.

### Opérations métier
- Support client : ticketing (Plain ou similaire), docs publiques, SLA contractuels.
- Onboarding : initial en assisté manuel (premiers 5-10 clients), puis self-service.
- Churn : flow de cancellation avec data export (GDPR/nLPD), rétention.
- Vente : cycle 2-6 mois, démo en visio, trial 14-30 jours, CRM (HubSpot ou Pipedrive).

### Conformité étendue
- **Éditeur SaaS** = sous-traitant au sens nLPD pour chaque tenant. DPA à fournir et à signer.
- **Audit staff éditeur** : toute consultation d'un tenant par un salarié éditeur est loggée et traçable (obligation contractuelle).
- **Registre des traitements** à étoffer pour le contexte SaaS (mise à jour `docs/compliance/registre-traitements.md`).
- **Transferts** : aucun hors Suisse. Les sous-traitants de l'éditeur (Stripe, Plain, Intercom, etc.) doivent avoir des entités EU/CH et des DPA signés.

## Risques spécifiques SaaS

| Risque | Probabilité | Mitigation |
|--------|-------------|-----------|
| Conflit d'intérêt perçu (agence + SaaS) | Haute | Filialisation obligatoire avant 1er client externe, clause contractuelle |
| Cycle de vente long, cash-flow négatif | Moyenne | Pricing annuel avec remise, focus sur un client phare (MP) avant de diluer |
| Churn à 12 mois si produit sous-utilisé | Moyenne | Onboarding assisté les 5-10 premiers, docs poussées, CSM à partir de 20 clients |
| Fuite multi-tenant (un tenant voit un autre) | Catastrophique | Tests exhaustifs B5.2, audit trimestriel, pentest annuel |
| Dépendance MP se retourne en concurrence | Moyenne | Multi-partenaires (accueillir d'autres plateformes de planification) |

## Go-to-market phase 2 (après pilote)

- **J+30** : landing publique live, trial self-service, 3 cibles LinkedIn (fondateurs d'agences en CH romande).
- **M+2** : 3 clients pilotes externes (agences amies + 1 PME).
- **M+3** : onboarding self-service débuggé, pricing verrouillé.
- **M+6** : 10 clients payants, MRR 3-5 k CHF.
- **M+12** : 20 clients payants, MRR 8-10 k CHF, décision Serie A ou bootstrap.

## Prochain pas

Exécuter `prompts/sprint-b-saas/B0.1-product-name-domain-branding.md` dès que possible (en parallèle du pilote phase 1, ça n'interfère pas).
