# Firebase Identity Platform — setup (action humaine)

> Action à exécuter par le fondateur après ADR-0003. Le code d'auth côté API est déjà en place (`apps/api/src/infrastructure/auth/` + `apps/api/src/shared/middleware/auth.middleware.ts`). Il ne reste qu'à créer les projets Firebase et les service accounts.

## 1. Créer les projets Firebase

Deux projets distincts pour isolation staging ↔ prod :

```
interim-agency-system           (prod)
interim-agency-system-staging   (staging)
```

Via la console : https://console.firebase.google.com/

- **Region par défaut** : `europe-west` (Belgique) — la région CH `europe-west6` n'est pas disponible pour Firebase Auth. Acceptable nLPD car Google Cloud DPA couvre le transfert CH → UE.
- **Google Analytics** : **désactiver** (pas de PII analytics).

## 2. Activer Identity Platform (upgrade du projet)

Chaque projet Firebase doit passer en **Identity Platform** pour accéder au multi-tenancy :

```
Firebase Console → Authentication → ... → Upgrade to Identity Platform
```

Coût : tier gratuit jusqu'à 50 000 MAU.

## 3. Activer les providers

**Back-office** (`web-admin`) :

- Email / Password : **activer**
- MFA (TOTP + SMS) : **activer** et configurer en obligatoire pour les rôles sensibles côté API (déjà codé dans `auth.middleware.ts`)

**Portail intérimaire** (`web-portal`) :

- Email link (sign-in via email) : **activer**
- Phone (OTP SMS) : **activer en secours** — pour la prod on préfèrera Swisscom SMS Enterprise (skill `swisscom-sms`) pour la cohérence CH.

## 4. Créer les tenants (un par agence)

Dans Identity Platform → Tenants :

- `agence-pilote` (pour l'agence de test en seed)
- Un tenant par vraie agence déployée.

Noter le `tenantId` pour chaque → injecter dans la DB Agency quand une agence est créée.

## 5. Service accounts pour l'API

```
IAM & Admin → Service Accounts → Create service account
```

- Nom : `interim-api-firebase-admin`
- Rôles : `Firebase Authentication Admin`
- Générer une clé JSON → télécharger

**Ne jamais committer** la clé JSON. Deux emplacements possibles :

- **Dev local** : `apps/api/secrets/firebase-dev.json` (listé dans `.gitignore` via `.env*`). Référencer via `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` dans `.env`.
- **Staging/prod** : Google Secret Manager, monté comme fichier dans le conteneur Cloud Run (voir A0.4-hosting).

## 6. Custom claims — format attendu

Quand un user est créé (signup ou invitation), une Cloud Function (ou le backoffice) doit poser les claims :

```typescript
await admin.auth(tenantId).setCustomUserClaims(uid, {
  agencyId: '<uuid de l'agence en DB>',
  role: 'agency_admin', // un des 7 rôles de `@interim/domain`
});
```

L'API vérifie ces claims via `FirebaseTokenVerifier.verifyIdToken()`. Sans `agencyId` + `role` valides, le token est rejeté.

## 7. Variables d'env à ajouter à `.env`

```env
FIREBASE_PROJECT_ID=interim-agency-system-staging
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=./apps/api/secrets/firebase-dev.json
```

Pour tester localement sans vraie clé, le middleware fonctionne avec un `TokenVerifier` stub (voir `auth.middleware.test.ts` pour le pattern).

## 8. Checklist go-live

- [ ] Projet prod `interim-agency-system` créé, Identity Platform actif
- [ ] Tous les providers configurés (Email+MFA, Email link, Phone)
- [ ] Tenants créés pour chaque agence cliente
- [ ] Service account `interim-api-firebase-admin` + clé JSON stockée en Secret Manager prod
- [ ] `FIREBASE_*` variables d'env injectées par Cloud Run depuis Secret Manager
- [ ] Test E2E : user agence A ne peut pas accéder aux données agence B (voir tests intégration A1.1)
- [ ] MFA obligatoire enforced pour admin + payroll_officer (déjà dans le code, vérifier en E2E)
- [ ] DPA Google Cloud mentionné dans `docs/compliance/registre-traitements.md`

## Liens

- ADR-0003 (`docs/adr/0003-auth-choice.md`)
- `CLAUDE.md §5`
- `docs/07-rôles.md §2`
- `apps/api/src/infrastructure/auth/firebase-verifier.ts`
- `apps/api/src/shared/middleware/auth.middleware.ts`
