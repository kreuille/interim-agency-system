# ADR-0003 — Choix du fournisseur d'authentification : Firebase Identity Platform

- **Date** : 2026-04-21
- **Statut** : accepté
- **Décideurs** : fondateur, lead tech
- **Contexte du prompt** : BLOCKER-004 (A0.6-auth-firebase-setup)

## Contexte

Nous devons authentifier deux populations très différentes :

1. **Back-office agence** (agency_admin, payroll_officer, dispatcher, HR, sales, viewer, auditor) → email + password + **MFA obligatoire** pour les rôles sensibles (admin, payroll).
2. **Portail intérimaire** mobile → **pas de mot de passe** (UX mobile, friction), magic link email ou OTP SMS.

Contraintes :

- **Multi-tenant** natif : une instance = plusieurs agences, chacune cloisonnée.
- Token JWT signé de façon vérifiable côté API Node.
- Rôle et `agencyId` portés dans les custom claims pour l'enforcement tenant.
- Conformité nLPD : hébergement/traitement CH ou UE avec DPA.
- Alignement avec GCP (ADR-0002).
- Coût MVP < 200 CHF/mois.

## Options considérées

1. **Firebase Identity Platform** (GCP) ✅ *retenu*
2. Supabase Auth (Supabase)
3. Auth0 (Okta)
4. Clerk
5. Self-hosted Keycloak

## Décision

**Firebase Identity Platform** avec tenant multi-agence.

Configuration cible :

- **Un projet Firebase** = `interim-agency-system` (prod) + un `interim-agency-system-staging` (staging).
- **Multi-tenancy Identity Platform** : un `tenant` Firebase par agence → isolation naturelle.
- **Providers** :
  - Back-office : Email/Password + MFA TOTP obligatoire sur rôles `agency_admin` et `payroll_officer`.
  - Portail intérimaire : Email Link (magic link) principal + OTP SMS secondaire (via Firebase Phone Auth ou SMS Swisscom pour cohérence CH).
- **Custom claims** posés par Cloud Function à l'inscription : `{ agencyId, role, tenantId }`.
- **Firestore Security Rules** (si besoin futur) + **vérification JWT Admin SDK** côté API Node via `firebase-admin`.

## Conséquences

### Positives

- **Natif GCP** (ADR-0002) → pas de bascule provider plus tard, facturation consolidée.
- **Multi-tenancy natif Identity Platform** → une agence = un `tenantId`, isolation garantie au niveau produit Firebase.
- **MFA TOTP + SMS** pris en charge out-of-the-box. WebAuthn aussi disponible.
- **Email Link magic sign-in** excellent pour le portail intérimaire (pas de mot de passe à retenir).
- **SDK Admin Node.js** (`firebase-admin`) mature pour vérifier les JWT côté API.
- **Observabilité** intégrée (Firebase Console + Cloud Logging).
- **Coût MVP très bas** : tier gratuit couvre largement les volumes d'une agence pilote (< 50 K MAU).

### Négatives

- **Dépendance Google/Firebase** — migrer vers un autre provider plus tard coûte de la friction (réémission des tokens, migration des users).
- **Hébergement des données users : région multi-régionale par défaut** → il faut configurer explicitement la région `europe-west` (Belgique/Allemagne/Londres) — pas de Suisse possible pour Firebase Auth à ce jour. **DPA Google Cloud** couvre la transmission CH→UE.
- **Pas de SMS Firebase en CH pour OTP** : Firebase Phone Auth CH fonctionne via des opérateurs tiers. Pour la qualité/tarif, on préfèrera SMS Swisscom Enterprise (skill `swisscom-sms`) pour les SMS métier, et Firebase Phone Auth uniquement si on a besoin de l'auth.
- **Identity Platform tier payant dès qu'on passe les 50 K MAU** ou qu'on active des fonctionnalités enterprise (SAML, OIDC, multi-tenancy avancée). Le multi-tenancy basique reste gratuit.

### Neutres

- Courbe d'apprentissage Firebase légère si l'équipe a déjà touché GCP.

## Conformité nLPD

- **DPA Google Cloud Switzerland GmbH** couvre Firebase.
- **Transfert CH → UE** (région `europe-west` pour Firebase Auth) documenté dans `docs/compliance/registre-traitements.md`.
- **Custom claims ne contiennent jamais de PII** — uniquement `agencyId`, `role`, `tenantId`. Nom/email restent côté DB agence (Cloud SQL europe-west6).
- **Retention Firebase Auth** : un utilisateur supprimé chez nous → API Admin SDK `deleteUser()` → retention résiduelle Firebase ≤ 30 j (loggé).

## Modèle RBAC (cf. `docs/07-rôles.md §2`)

```
agency_admin    -> tous droits sur l'agence
payroll_officer -> paie, bulletins, ELM, virements
dispatcher      -> missions, propositions, SMS intérimaires
hr              -> intérimaires, documents, contrats
sales           -> clients, grilles tarifaires, facturation
viewer          -> lecture seule
auditor         -> lecture seule + export conformité
```

MFA obligatoire sur `agency_admin` et `payroll_officer`. Enforcement côté API : refus si `email_verified: false` ou `!mfa_verified` pour ces rôles.

## Alternatives rejetées (résumé)

- **Supabase Auth** : excellent OSS, mais pas natif GCP, multi-tenancy "hard" moins mature, perte de l'alignement cloud.
- **Auth0** : cher à notre taille (tier Pro dès qu'on veut MFA + multi-tenant).
- **Clerk** : très bon DX, mais US-hosted, complique le dossier nLPD.
- **Self-hosted Keycloak** : surdimensionné pour MVP, ops non-trivial (cluster HA + DB).

## Liens

- `docs/05-architecture.md §5`
- `docs/07-rôles.md §2`
- `CLAUDE.md §5`
- ADR-0002 (GCP)
- `skills/dev/security-hardening/SKILL.md`
