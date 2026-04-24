# Bexio vs Abacus — Comparatif pour l'agence d'intérim

> **Objectif** : choisir l'outil ERP/compta/paie certifié Swissdec qui porte l'ELM (annonces caisses) + export comptable.
> **Volume estimé** : 15 intérimaires actifs au pilote, 100-120 à M+12, 200+ à M+24.
> **Débloque** : A5.5 (ELM Swissdec) + A5.9 (export compta).
> **Responsable** : fondateur (+ comptable si déjà mandaté).

---

## 1. Pourquoi Bexio ou Abacus

Parce que Swissdec-certifier notre propre émetteur ELM prendrait 6+ mois et coûterait une fortune en audit. La voie rationnelle est de passer par un logiciel déjà certifié qui fait intermédiaire.

Trois candidats sérieux en Suisse :

- **Bexio** — cloud-first, API REST moderne, pricing PME, couverture complète (compta + paie + ELM).
- **Abacus** — leader historique Suisse, très complet, plus cher, plutôt pour >30 ETP.
- **Swiss21** — option cheap (gratuit jusqu'à un seuil) mais moins mature sur ELM et API.

Ce document compare les deux premiers sérieusement.

---

## 2. Tableau comparatif

| Critère | Bexio | Abacus |
|---------|-------|--------|
| Éditeur | Bexio AG (Suisse, filiale Mobiliar depuis 2018) | Abacus Research AG (Saint-Gall, indépendant) |
| Modèle | Cloud SaaS pur | Cloud OU on-prem (AbaCliK / AbaWeb) |
| Public cible | PME 1-50 ETP | PME 10-500 ETP |
| Langue interface | FR / DE / IT / EN | FR / DE / IT / EN |
| Certification Swissdec ELM | ✅ niveau 5.0 | ✅ niveau 5.0 |
| Paie (module) | Oui, natif | Oui, référence historique sur le marché CH |
| Compta | Oui, plan PME suisse natif | Oui, très riche (adapté PME sophistiquées + grandes) |
| Factures QR-bill | Oui | Oui |
| API REST | ✅ Excellente, OpenAPI documenté, OAuth2 | ✅ Oui, SOAP + REST selon module, moins DX-friendly |
| SDK Node.js | Officiel + communautaire | Wrapper tiers moins stable |
| Webhooks sortants | Limités | Assez bons |
| Import bancaire camt.053 | Oui | Oui |
| Export pain.001 | Oui | Oui |
| **Prix paie + ELM** | ~80 CHF/mois (Pro) + 2-3 CHF/bulletin | ~200 CHF/mois (AbaSalary) + licence selon taille |
| **Prix compta** | ~60 CHF/mois (Pro) inclus | Inclus selon licence |
| Setup | ~0 CHF (self-service) ou 500-1k CHF via partenaire | 2-5k CHF d'implémentation |
| Support FR | Oui | Oui (via partenaire) |
| Communauté / ressources | Large communauté PME CH romande | Plus institutionnelle, réseau de partenaires |
| Courbe d'apprentissage | Faible (1-2 j) | Moyenne-forte (5-10 j) |
| Scalabilité > 500 ETP | Non recommandé | Oui, très bon |

---

## 3. Fit avec notre architecture

On a codé un **port TypeScript** (`infrastructure/elm/elm-port.ts`) abstrayant l'intégration. L'adapter peut être l'un ou l'autre. Mais côté intégration pratique :

### Bexio
- **API REST OpenAPI** — on génère les types directement avec `openapi-typescript`, on mappe nos entités sur les leurs.
- OAuth2 avec refresh token — à gérer (10 min de code).
- Webhook pour les annonces ELM confirmées.
- Nécessite un **compte Bexio actif** — 80 CHF/mois même avant go-live (pour le sandbox).

### Abacus
- **API SOAP/XML** historiquement — plus verbeux côté code.
- Wrappers Node tiers existent mais moins maintenus.
- Intégration plus lourde — compter 2x le temps de wiring vs Bexio.
- Compte + licence obligatoire pour accéder au sandbox.

---

## 4. Recommandation pour le MVP

### Bexio au démarrage

Arguments :

- **Time-to-market rapide** : API REST propre, OAuth2, docs excellentes. Notre adapter Node se code en 2-3 jours vs 5-7 jours pour Abacus.
- **Coût abordable** : 80-150 CHF/mois en phase pilote, ça passe sans justification budgétaire.
- **Self-service** : on active nous-mêmes, pas besoin de consulter un intégrateur Abacus.
- **Compta intégrée** : plan PME suisse natif, import camt.053 auto, export pain.001 inclus → on couvre aussi A5.9.
- **Évolutivité suffisante** : Bexio tient jusqu'à ~50-80 ETP sans pépin. Si on dépasse vers 200+ ETP, on migre vers Abacus à ce moment-là (coût de migration pas négligeable mais acceptable).

### Quand basculer vers Abacus

Signaux qui déclenchent l'étude de migration :

- > 100 intérimaires actifs en paie chaque semaine (volume Bexio commence à peser).
- Besoin de comptabilité analytique multi-dimensions (centres de coût, projets).
- Multi-société (si l'agence crée des filiales).
- Consolidation groupe.
- Comptable interne habitué à Abacus qui le demande explicitement.

Dans ces cas : prévoir 20-40 kCHF d'implémentation Abacus (éditeur + partenaire-intégrateur), 1-2 mois de migration, formation.

---

## 5. Checklist d'activation Bexio

### Semaine 1 : souscription
- [ ] Créer un compte https://www.bexio.com/fr-CH/demarrer.
- [ ] Choisir plan **Pro** (compta + paie) — ne pas prendre plan "Starter" (pas d'ELM).
- [ ] Renseigner l'identité entreprise : IDE, statuts, adresse.
- [ ] Activer la **période d'essai 30j** pour tester sans s'engager.

### Semaine 1-2 : configuration compta
- [ ] Paramétrer plan comptable PME suisse (Bexio propose un plan par défaut).
- [ ] Configurer TVA 8.1% + codes TVA (prestations location services).
- [ ] Importer IBAN PostFinance ou UBS pour rapprochement camt.053.
- [ ] Configurer numérotation factures (ex. `AG-2026-NNNN`).

### Semaine 2-3 : configuration paie + ELM
- [ ] Module Paie activé.
- [ ] Affiliations déclarées :
  - Caisse AVS cantonale.
  - Assurance AC (Caisse chômage / Unia selon branche).
  - SUVA (pour BTP/déménagement/transport).
  - Caisse LPP (choisie : Swiss Life, Axa, Helvetia, Swisscanto, etc.).
- [ ] Import des barèmes IS cantonaux (Bexio propose un import semi-auto).
- [ ] Test envoi ELM simulation (mode sandbox Bexio + Swissdec).

### Semaine 3 : intégration API
- [ ] Créer une application Bexio dans Developer portal.
- [ ] Récupérer client_id + client_secret OAuth2.
- [ ] Stocker dans Secret Manager GCP.
- [ ] Implémenter l'adapter `BexioElmAdapter implements ElmPort`.
- [ ] Tests intégration sandbox (annonce 1 bulletin de test).

### Semaine 4 : production
- [ ] Bascule sur plan Bexio Pro payant.
- [ ] Première paie réelle pilote.
- [ ] Première annonce ELM réelle aux caisses.

---

## 6. Options tierces à considérer

Si Bexio trop limité et Abacus trop lourd, il existe :

- **uelohn** (www.uelohn.ch) — connecteur Swissdec dédié, API directe aux caisses, pas de compta. Bon fit si tu veux garder notre code et juste brancher l'ELM.
- **Swissdec-Connector** — librairie tiers pour faire l'ELM en direct. Plus technique, moins documenté.
- **Swiss21** (www.swiss21.org) — gratuit pour volumes faibles, ELM certifié, plus limité sur la paie complexe.

Recommandation : **Bexio pour l'instant**, reconsidérer à M+6 selon volume et satisfaction.

---

## 7. Demos à demander cette semaine

Trois demos à planifier :

1. **Bexio demo en ligne** — lien direct sur leur site, 20 min, pas d'engagement. À faire mardi.
2. **Abacus via partenaire CH romande** — contacter Talus Informatique ou ABAG Treuhand (Genève/Lausanne) pour demo adaptée. 1h. Si intérêt, demande un chiffrage.
3. **Swiss21** — démo gratuite self-service, pour comparaison de bas de gamme.

---

## 8. Contacts utiles

| Vendeur | Contact | Note |
|---------|---------|------|
| Bexio AG | contact@bexio.com / +41 44 123 45 00 | Support FR, commercial en ligne |
| Abacus Research AG | info@abacus.ch / +41 71 292 25 25 | Passer par un partenaire CH romande |
| Talus Informatique (partenaire Abacus) | info@talus.ch | Lausanne |
| uelohn | info@uelohn.ch | Connecteur ELM seul |

---

**Recommandation finale** : **Bexio Pro** pour démarrer, à activer semaine 1 du plan go-to-market. 80-150 CHF/mois, 2-3 semaines pour être ELM-ready en sandbox, 3 semaines pour go-live ELM réel. Adapter ELM code = 2-3 jours session Claude Code une fois credentials Bexio reçus.

**Fin du document v1.0 — 2026-04-23**
