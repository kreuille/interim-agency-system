# Skill — Facturation QR-bill Swiss Payment Standards

## Rôle
Comptable / dev facturation. Génère des factures conformes à la norme QR-bill (obligatoire en Suisse depuis 01.10.2022).

## Quand l'utiliser
Génération de facture client (MovePlanner + autres), réception facture fournisseur, rapprochement bancaire camt.053.

## Concepts clés
- **QR-bill** : format unique d'encaissement en CHF / EUR, remplace bulletins rouges/orange depuis 2022.
- **QR-IBAN** (QRR) : IBAN spécifique avec référence structurée 27 chiffres permettant rapprochement automatique. Alternative : IBAN classique avec référence "Creditor Reference" ISO 11649.
- **Swico S1** : ancien standard de facture électronique suisse, remplacé par QR-bill + optionnellement ZUGFeRD-like (pas standard CH, donc non prioritaire).
- **Payload QR** : texte structuré à 31 lignes encodé en QR (ECC M). Librairie obligatoire : `swissqrbill` (Node.js) ou équivalent.

## Règles dures
- Montant facturé en CHF (ou EUR). Jamais arrondi faux — le QR-bill doit contenir exactement le montant dû.
- TVA 8.1% (taux normal) pour location de services (soumis TVA sauf cas spécifiques).
- La **référence QR (QRR)** est **unique** et **réutilisable** si la facture est émise par le même créancier. Stockage persistant dans la table `invoices`.
- PDF A4 recto, section QR en bas selon gabarit Swiss Payment Standards (dimensions fixes).

## Données obligatoires dans un QR-bill

- Créancier : nom, adresse, pays, IBAN/QR-IBAN
- Débiteur : nom, adresse, pays
- Montant + devise
- Référence : QRR (27 chiffres) ou SCOR (ISO 11649) ou "NON" (sans référence)
- Informations additionnelles libres (numéro de facture, période)
- (optionnel) Informations du créancier structurées Swico S1

## Génération (Node.js)

```typescript
import { SwissQRBill } from 'swissqrbill/pdf'
import PDFDocument from 'pdfkit'

const data = {
  currency: 'CHF',
  amount: 15420.55,
  reference: '210000000003139471430009017', // QRR 27 chiffres
  creditor: {
    name: 'Agence Intérim SA',
    address: 'Rue du Lac 12',
    zip: 1003, city: 'Lausanne',
    account: 'CH4431999123000889012', country: 'CH',
  },
  debtor: {
    name: 'MovePlanner SA', address: 'Av. de la Gare 45',
    zip: 1003, city: 'Lausanne', country: 'CH',
  },
  message: 'Facture AG-2026-0145 - mai 2026',
}

const doc = new PDFDocument({ size: 'A4' })
// ...ajouter l'en-tête, les lignes, la TVA...
new SwissQRBill(doc, data).attachTo(doc)
doc.end()
```

## Génération de référence QRR (27 chiffres)

```
{sujet_agence 6 chiffres} {numéro_client 10 chiffres} {numéro_facture 10 chiffres} {chiffre_contrôle modulo 10}
```

Stocker dans `invoices.reference_qrr`. Unicité garantie par contrainte DB.

## Pratiques
- Un **numéro de facture** séquentiel par année, format `AG-{year}-{seq:04}`.
- Un **plan de relance** : J+7 rappel amiable, J+15 relance ferme, J+30 mise en demeure, J+45 transmission contentieux.
- **Rapprochement** automatique sur réception camt.053 : matching par QRR, fallback sur montant + IBAN + date ± 3j.
- **Annulation** via facture négative (avoir) + émission nouvelle facture. Jamais de modification a posteriori.
- Conservation **10 ans** (CO 958f + TVA).

## Pièges courants
- Utiliser un IBAN classique avec référence libre (non structurée) → pas de matching auto.
- Oublier que la QRR contient un chiffre de contrôle modulo 10 — calcul à faire correctement ou librairie.
- Montants arrondis en amont (ex. total HT arrondi, TVA calculée dessus) → écarts de quelques centimes entre lignes et total. Arrondir sur le total final uniquement.
- PDF généré avec marges incorrectes → QR illisible par les scanners bancaires.
- Envoi du QR-bill seulement en PDF embarqué dans un email sans signature — risque de phishing inverse (le client croit que l'IBAN a changé).

## Références
- Swiss Payment Standards : https://www.paymentstandards.ch
- Librairie `swissqrbill` : https://github.com/schoero/SwissQRBill
- `docs/01-brief.md §4.8`, `§3.6`
