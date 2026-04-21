# Skill — Comptabilité suisse PME (Bexio / Abacus)

## Rôle
Comptable PME suisse. Tient les écritures, prépare la TVA, clôture l'exercice selon plan comptable suisse.

## Quand l'utiliser
Export comptable, intégration Bexio/Abacus, clôture, TVA, rapports financiers.

## Concepts clés
- **Plan comptable PME suisse** (recommandation veb.ch) — pas le PCG français.
- **Comptes 4 chiffres** typiques :
  - 1020 Compte courant CHF
  - 1100 Créances clients
  - 1106 Créances envers fournisseurs (QR-bill entrants)
  - 1170 TVA récupérable
  - 2000 Créanciers (fournisseurs)
  - 2200 TVA due
  - 2270 AVS/AC/LAA/LPP à payer
  - 3200 Produits prestations (CA intérim)
  - 4400 Charges sous-traitance
  - 5000 Salaires bruts
  - 5200 Charges personnel temporaire (intérim envoyé chez clients = notre CA, donc 3200 côté ventes)
  - 5700 Cotisations sociales employeur
- **TVA** : 8.1% taux normal, 3.8% hébergement, 2.6% taux réduit. Déclaration **trimestrielle** ou **mensuelle** selon CA.
- **Clôture annuelle** : bilan + compte de résultat + annexe, signé + audit obligatoire si CA > 40M ou total bilan > 20M ou 250 ETP.

## Règles dures
- Double écriture comptable. Débit = crédit à chaque opération.
- TVA collectée et payée selon périodicité déclarée. Décalage = amende.
- Conservation **10 ans** des pièces (CO 958f).
- Intégration automatique paie → compta : charges (5000, 5700) + contreparties (2270, 1020).

## Exemple d'écritures

**Émission facture MovePlanner 15'420.55 CHF HT (TVA 8.1%) :**
```
1100 Créances clients               16 669.61
  3200 Produits prestations intérim    15 420.55
  2200 TVA due                          1 249.06
```

**Paie intérimaire Jean Dupont, brut 4 000 CHF, charges employeur 520 CHF, déductions 680 CHF :**
```
5000 Salaires bruts                  4 000.00
5700 Cotisations sociales employeur    520.00
  2270 Caisses sociales à payer         1 200.00
  1020 Compte courant (net payé)        3 320.00
```

**Encaissement facture MovePlanner :**
```
1020 Compte courant                  16 669.61
  1100 Créances clients               16 669.61
```

## Intégration Bexio / Abacus

- **Bexio** : API REST moderne, OAuth2. Création de facture + ventilation comptable automatique via `projects` et `positions`. Bon pour < 5M CHF CA.
- **Abacus** : API REST + SOAP, robuste mais plus complexe. Standard Suisse grands PME. Bon > 5M CHF CA ou multi-société.
- **Choix par défaut** : Bexio au démarrage, Abacus si complexité augmente.
- **Export** : fichier CSV générique (aussi livré en fallback) avec : date, compte débit, compte crédit, montant, libellé, pièce.

## Pratiques
- **Clôture mensuelle** : job fin de mois, vérification que toutes les factures sont comptabilisées, exports transmis au comptable externe le cas échéant.
- **Lettrage** automatique : quand un paiement encaissé via camt.053 matche une créance → lettrage auto. Sinon, en attente de lettrage manuel.
- **Provision** créances douteuses : > 90 j impayés → provision 50%, > 180 j → provision 100%.
- **TVA** : écritures générées automatiquement, export pour déclaration eTVA (AFC).

## Pièges courants
- Utiliser le PCG français par habitude → incompatible avec comptable suisse.
- Oublier la TVA sur factures internationales (CH → UE : exonérée pour prestations de services, mais formalités à respecter).
- Compta manuelle Excel à côté de Bexio → double saisie = erreurs. Le SI doit pousser à Bexio, pas l'inverse.
- Arrondir en compta ; toujours stocker en Rappen et arrondir uniquement à l'affichage.

## Références
- Plan comptable PME veb.ch : https://www.veb.ch
- Bexio API : https://docs.bexio.com
- Abacus : https://www.abacus.ch
- AFC TVA : https://www.estv.admin.ch
- `docs/01-brief.md §4.8`
