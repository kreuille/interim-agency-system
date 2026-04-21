# Skill — SMS (Swisscom Enterprise / Twilio)

## Rôle
Intégrateur messaging. Envoie des SMS courts, fiables, traçables, aux intérimaires et gestionnaires.

## Quand l'utiliser
Envoi d'OTP, notifications de proposition mode "contrôle" (renvoi depuis l'agence), confirmation contrat signé, alertes urgentes.

## Concepts clés
- **Swisscom Enterprise Messaging** (recommandé CH) : opérateur national, conformité nLPD native, numéro émetteur alphanumeric.
- **Twilio** (fallback) : global, prix variable, DPA à vérifier pour conformité nLPD.
- **Sender ID** : alphanumerique "AgenceXYZ" possible en CH (11 caractères max), pas toujours autorisé à l'étranger.
- **Coût indicatif** : 0.08–0.15 CHF / SMS en CH selon volume.

## Règles dures
- **Consentement** préalable de l'intérimaire (opt-in) tracé en base au moment de l'onboarding.
- **Opt-out** : "STOP" mot-clé respecté, réponse automatique de confirmation.
- **Pas de PII en contenu** (pas de montants CHF détaillés ni nom complet client sensible) — les SMS passent par l'opérateur en clair.
- **Lien court** pour les propositions : `https://m.monagence.ch/p/{token}` avec expiration 30 min.
- **Rate limit** : max 10 SMS/min/utilisateur, 100/h, alertes au-delà (suspicion boucle).

## Cas d'usage

| Cas | Template SMS (≤ 160 car.) |
|-----|---------------------------|
| OTP signature contrat | `AgenceXYZ: votre code de signature : {code}. Valide 10 min. Ne partagez pas.` |
| Proposition mission (mode pass-through interne) | `AgenceXYZ: mission {date} {villeA}→{villeB} {créneau} {taux}/h. Accept/refus : {shortlink}` |
| Confirmation acceptation | `AgenceXYZ: mission confirmée {date}. Détails et RDV : {shortlink}` |
| Alerte document expirant | `AgenceXYZ: votre permis expire le {date}. Merci de nous transmettre le renouvellement.` |
| Info paie | `AgenceXYZ: votre paie de la sem. {N} est disponible sur votre portail.` |

## Pattern — adapter (port + 2 implementations)

```typescript
// domain/ports/sms-sender.port.ts
export interface SmsSender {
  send(input: { to: string; message: string; category: 'otp' | 'proposal' | 'info' }): Promise<Result<SmsSentId, SmsError>>
}

// infrastructure/sms/swisscom-adapter.ts
export class SwisscomSmsAdapter implements SmsSender { /* ... */ }

// infrastructure/sms/twilio-adapter.ts
export class TwilioSmsAdapter implements SmsSender { /* ... */ }
```

Choix runtime via config (`config.smsProvider`).

## Pratiques
- **Persistance** de chaque envoi (`sms_logs` : `id, to_masked, category, status, provider_id, sent_at`). Numéro masqué (`+4179****56`).
- **Webhook de statut** (delivered/failed) vers `POST /webhooks/sms` pour MAJ du log.
- **Templates** centralisés dans `apps/api/src/templates/sms/*.mustache` avec params typés.
- **Test** : environnement staging utilise un provider "noop" qui logge sans envoyer, ou Twilio test credentials.

## Pièges courants
- Envoyer un SMS contenant un mot de passe ou un lien non signé → phishing possible.
- Oublier d'encoder les caractères spéciaux (accents, emojis) → SMS tronqué ou split en 3.
- Ne pas gérer le "STOP" → plainte PFPDT.
- Sender ID non réservé → SMS arrivent avec numéro court random = taux d'ouverture bas.
- Ne pas limiter le rate → abus possible (boucle de renvoi).

## Références
- `docs/02-partners-specification.md §5.2`
- Swisscom Enterprise Messaging : https://www.swisscom.ch/fr/business/enterprise/themen/m2m-iot/sms-service.html
- Twilio DPA : https://www.twilio.com/legal/data-protection-addendum
