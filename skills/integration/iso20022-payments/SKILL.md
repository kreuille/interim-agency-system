# Skill — Paiements ISO 20022 (pain.001 / camt.053)

## Rôle
Intégrateur banque / trésorerie. Génère les virements salaires et lit les relevés pour rapprochement.

## Quand l'utiliser
Batch paie vendredi : génération pain.001 pour virement intérimaires. Réception camt.053 pour rapprochement factures encaissées.

## Concepts clés
- **ISO 20022** : standard international messaging financier. La Suisse l'utilise pour tous les virements bancaires depuis 2018 (retrait DTA).
- **pain.001** : "Payment Initiation" — instruction de virement envoyée par l'entreprise à la banque.
- **pain.002** : statut de traitement d'un pain.001 (accepté, rejeté, partiellement).
- **camt.053** : relevé de compte quotidien envoyé par la banque.
- **camt.054** : avis de crédit/débit détaillé (souvent par transaction).
- **EBICS** : protocole d'échange sécurisé entre l'ERP/compta et la banque (alternative à l'upload manuel).

## Règles dures
- Format pain.001.001.09 (CH) avec XSD officiel (SIX Interbank Clearing).
- Montants en CHF, décimales exactes (2 chiffres), pas de flottant.
- IBAN débiteur (agence) et IBAN créancier (intérimaire) valides mod 97.
- `InstructionIdentification` unique (traçabilité), `EndToEndIdentification` pour rapprochement côté bénéficiaire.
- Signature XML si la banque l'exige (EBICS T vs EBICS A).

## Pattern — génération pain.001 (squelette)

```typescript
import { Builder } from 'xml2js'

interface PainLine {
  endToEndId: string
  amountRappen: bigint
  creditorName: string
  creditorIban: string
  remittanceInfo: string
}

export function buildPain001(
  msgId: string,
  debtorName: string,
  debtorIban: string,
  lines: PainLine[],
): string {
  const root = {
    Document: {
      $: { xmlns: 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09' },
      CstmrCdtTrfInitn: {
        GrpHdr: {
          MsgId: msgId,
          CreDtTm: new Date().toISOString(),
          NbOfTxs: lines.length.toString(),
          CtrlSum: totalChfString(lines),
          InitgPty: { Nm: debtorName },
        },
        PmtInf: {
          PmtInfId: msgId,
          PmtMtd: 'TRF',
          BtchBookg: 'true',
          NbOfTxs: lines.length.toString(),
          ReqdExctnDt: { Dt: todayIso() },
          Dbtr: { Nm: debtorName },
          DbtrAcct: { Id: { IBAN: debtorIban } },
          DbtrAgt: { FinInstnId: { BICFI: 'POFICHBEXXX' } }, // ou resolved depuis IBAN
          CdtTrfTxInf: lines.map(l => ({
            PmtId: { InstrId: l.endToEndId, EndToEndId: l.endToEndId },
            Amt: { InstdAmt: { $: { Ccy: 'CHF' }, _: chfString(l.amountRappen) } },
            Cdtr: { Nm: l.creditorName },
            CdtrAcct: { Id: { IBAN: l.creditorIban } },
            RmtInf: { Ustrd: l.remittanceInfo },
          })),
        },
      },
    },
  }
  return new Builder({ headless: false, renderOpts: { pretty: true } }).buildObject(root)
}
```

## Pratiques
- **Librairie recommandée** : `node-iso20022` ou implémentation maison avec validation XSD (fichiers XSD sur https://www.six-group.com).
- **Validation** contre le XSD **avant** envoi à la banque (échec tôt, pas en prod).
- **Transport** : upload manuel web banking pour MVP, puis EBICS en phase d'industrialisation.
- **Rapprochement camt.053** : parser XML, matcher sur QRR (reference structurée) puis sur montant + IBAN.
- **Archivage** : pain.001 générés + pain.002 reçus + camt.053 conservés 10 ans.

## Pièges courants
- XSD version erronée → rejet silencieux par la banque.
- Séparateur décimal `,` au lieu de `.` → rejet.
- Somme des lignes ≠ `CtrlSum` au Rappen près → rejet.
- IBAN du débiteur incompatible avec l'institution financière (BIC) → rejet.
- Envoyer deux fois le même `MsgId` → erreur "duplicate".

## Références
- Swiss Payment Standards : https://www.paymentstandards.ch
- SIX Interbank Clearing : https://www.six-group.com/interbank-clearing
- XSD officiels : publiés annuellement
- `docs/01-brief.md §4.7`
