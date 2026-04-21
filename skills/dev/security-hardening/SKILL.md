# Skill — Durcissement sécurité

## Rôle
Ingénieur sécurité applicative. Modélise les menaces, durcit le code et l'infra, et refuse les raccourcis "on verra plus tard".

## Quand l'utiliser
Auth, autorisation, upload fichier, intégration externe, export de données, logs, secrets, webhooks, tout flux sortant.

## Concepts clés
- **Threat modeling STRIDE** : Spoofing, Tampering, Repudiation, Information disclosure, DoS, Elevation.
- **Defense in depth** : chaque couche a ses contrôles.
- **Least privilege** : un token de compte de service ne peut que ce qu'il doit faire.
- **Zero trust interne** : même entre services.

## Règles dures
- **Pas de secret** en clair dans le code, les logs, les messages d'erreur, les URL.
- **HMAC** sur tout webhook entrant ; comparaison en **constant-time** (`crypto.timingSafeEqual`).
- **mTLS** pour les appels sortants vers MovePlanner. Rotation certificats 90 j.
- **Idempotency-Key** sur tout POST/PUT sortant, persisté pour rejeu sûr.
- **CSP stricte** côté web : `default-src 'self'; script-src 'self' 'nonce-{nonce}'; object-src 'none'; frame-ancestors 'none'`.
- **Headers** : HSTS ≥ 1 an avec preload, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), microphone=()`.
- **Authentification** MFA obligatoire pour `agency_admin`, `payroll_officer`. TOTP ou WebAuthn, pas SMS (vulnérable SIM swap).
- **Rate limit** : 100 req/min/IP, 1000 req/min/tenant, 20 login/h/email.
- **Upload** : validation MIME par *magic bytes* (pas extension), scan ClamAV asynchrone, stockage hors webroot.

## Pratiques
- Helmet en Express avec config explicite (pas les defaults seuls).
- JWT courts (15 min) + refresh token révocable. JWT signés RS256 ou EdDSA, pas HS256 en multi-service.
- Les erreurs renvoyées aux clients : pas de stack trace, pas de message interne. `{ error: { code, message } }` avec messages génériques.
- Les logs côté serveur : stack traces OK mais sans PII (staffId pseudonymisé, email masqué).
- Dépendances : Dependabot + `npm audit` en CI. Blocage HIGH/CRITICAL.
- Pentest annuel + pentest après changement majeur d'archi.

## Pattern — vérification HMAC

```typescript
import crypto from 'node:crypto'

export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string, // "sha256=abcdef..."
  timestampHeader: string, // epoch seconds
  secret: string,
  toleranceSeconds = 300,
): boolean {
  const ts = Number(timestampHeader)
  if (!Number.isFinite(ts)) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > toleranceSeconds) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${rawBody.toString('utf8')}`)
    .digest('hex')
  const provided = signatureHeader.replace(/^sha256=/, '')
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(provided, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
```

## Pattern — express middleware

```typescript
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

app.use(helmet({
  contentSecurityPolicy: { useDefaults: false, directives: { /* ... */ } },
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}))
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }))
```

## Pièges courants
- Comparer HMAC avec `===` (timing attack). Toujours `timingSafeEqual`.
- Logger le payload d'un webhook entrant → PII en clair dans Grafana. Pseudonymiser ou stocker séparément avec accès restreint.
- Autoriser CORS `*` en prod. Toujours une allowlist explicite.
- JWT HS256 avec secret partagé entre services → compromission d'un service = compromission globale.
- Upload sans limite de taille → DoS trivial. Limiter côté proxy et côté app.

## Références
- `CLAUDE.md §5`
- https://cheatsheetseries.owasp.org
- https://owasp.org/www-project-top-ten/
