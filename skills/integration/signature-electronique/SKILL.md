# Skill — Signature électronique (ZertES)

## Rôle
Intégrateur signature légale. Garantit la recevabilité des contrats et documents signés selon la loi suisse.

## Quand l'utiliser
Génération d'un contrat de mission à faire signer par l'intérimaire, signature par le client, archivage légal.

## Concepts clés
- **SCSE / ZertES** : loi fédérale sur la signature électronique. Reconnaît 3 niveaux :
  - **Simple** : case à cocher + identification basique. Recevable pour accords informels, pas pour contrats de mission LSE.
  - **Avancée** : identification forte (ex. SMS OTP post-KYC). Recevable pour la majorité des contrats commerciaux.
  - **Qualifiée (QES)** : certificat délivré par un prestataire certifié **KPMG / Swisscom Trust Services / SwissSign**. Équivalent signature manuscrite en droit suisse.
- Pour un **contrat de mission LSE**, l'avancée suffit en pratique. Le fondateur peut viser QES pour plus de robustesse.

## Fournisseurs recommandés
- **Swisscom Trust Services (Signing Services)** : QES native CH, API REST, coût ~1–3 CHF / signature qualifiée. Premier choix.
- **SwissSign** (Skribble) : interface utilisateur très propre, bon fit SMB. API REST.
- **SuisseID** : orienté admin publique, pertinent pour certaines prestations B2G.
- **À éviter pour les contrats LSE** : DocuSign US, HelloSign (recevabilité en cas de contentieux suisse non garantie sans accords supplémentaires, et transfert de données US problématique nLPD).

## Règles dures
- **Niveau minimum** : signature avancée pour contrat de mission.
- **Horodatage RFC 3161** via tiers de confiance (Swiss Post ou Swisscom).
- **Stockage** du document signé + **preuves de signature** (certificat, logs identification, horodatage) dans GED chiffrée CMEK, conservation 10 ans.
- **Pas de modification** du document après signature. Un corrigendum crée un nouveau document.

## Flux type — contrat de mission en avancée

```
1. Génération PDF du contrat (A.4 pipeline)
2. Upload vers API Swisscom Signing Services
3. Création d'une "signing request" avec destinataires :
   - intérimaire (signature SMS OTP)
   - agence (signature serveur automatique)
4. Envoi lien signature intérimaire (SMS + email)
5. Intérimaire clique → identification (SMS OTP) → consulte PDF → signe
6. Callback webhook "signature.completed" → MAJ contrat status = signed
7. Récupération PDF signé + attestation → archivage GED
```

## Pattern — adapter port

```typescript
export interface SignatureProvider {
  createSigningRequest(input: {
    documentPdf: Buffer
    signers: { role: 'worker' | 'agency'; phone?: string; email: string; name: string }[]
    signingLevel: 'advanced' | 'qualified'
    expiresInMinutes: number
  }): Promise<Result<{ requestId: string; signerLinks: Record<string, string> }, ProviderError>>

  getSignedDocument(requestId: string): Promise<Result<{ pdf: Buffer; proof: Buffer }, ProviderError>>
}
```

## Pratiques
- **Webhook callback** du fournisseur → route dédiée `/webhooks/signature` avec signature HMAC elle aussi.
- **Expiration** par défaut 48 h ; relance automatique à J-24h et J-2h.
- **Fallback signature manuelle** : si intérimaire sans mobile / litigieux, fournir un PDF à imprimer + signature manuscrite scannée (accepté mais moins robuste).
- **Tests E2E** : environnement sandbox Swisscom, simuler signature sans OTP réel.

## Pièges courants
- Utiliser simple quand la loi exige avancée → signature contestable.
- Oublier de télécharger la preuve (attestation de signature) — le PDF signé seul ne suffit pas devant un tribunal.
- Ne pas archiver 10 ans → perte de moyen de preuve.
- Conserver les secrets API du fournisseur en env variable committée (oui ça arrive).

## Références
- SCSE : https://www.fedlex.admin.ch/eli/cc/2016/752/fr
- Swisscom Trust Services : https://trustservices.swisscom.com
- Skribble : https://www.skribble.com
- `docs/01-brief.md §4.5`
- `docs/02-partners-specification.md §8.4`
