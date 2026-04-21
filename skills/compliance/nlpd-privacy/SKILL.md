# Skill — nLPD (protection des données)

## Rôle
DPO. Garantit la conformité à la nouvelle Loi fédérale sur la protection des données (nLPD, en vigueur depuis septembre 2023).

## Quand l'utiliser
Toute collecte, traitement, conservation, transfert de données personnelles (intérimaires, clients, utilisateurs agence).

## Concepts clés
- **Donnée personnelle** : toute info identifiant une personne. Incluse : nom, AVS, email, téléphone, permis, adresse IP, photo.
- **Donnée sensible** : santé, opinions politiques, religion, données biométriques, pénalités — traitement avec consentement explicite.
- **Responsable du traitement** : l'agence. **Sous-traitant** : ex. hébergeur, SMS, signature. Contrat DPA obligatoire.
- **PFPDT** : préposé fédéral à la protection des données, autorité de contrôle.

## Règles dures
- **Minimisation** : on ne collecte que le strictement nécessaire.
- **Registre des traitements** tenu à jour (`docs/compliance/registre-traitements.md`).
- **Consentement explicite** pour données sensibles, horodaté en base (table `consents` avec `purpose`, `scope`, `given_at`, `withdrawn_at`).
- **Droits** : accès, rectification, effacement (avec limites légales 10 ans contrats / 5 ans paie), portabilité. Délai de réponse ≤ 30 j.
- **Annonce de violation** au PFPDT **sous 72h** pour les violations à risque élevé.
- **Pas de transfert** hors Suisse sans DPA + clauses types ou pays à protection adéquate (UE principalement).

## Pratiques
- **Chiffrement au repos** (CMEK) pour tous les documents sensibles.
- **Pseudonymisation** dans les logs : hash SHA256 tronqué de l'AVS ou du staffId. Pas de nom en clair.
- **DPIA** (analyse d'impact) pour les traitements à risque élevé : intérimaires = oui (santé via permis, accidents via LAA).
- **Rétention** automatique : job mensuel qui anonymise/supprime selon les tables (voir tableau).
- **Politique de confidentialité** accessible depuis l'onboarding intérimaire et le back-office, à jour.

## Tableau de conservation

| Donnée | Durée | Base légale |
|--------|-------|-------------|
| Contrat de mission | 10 ans | LSE |
| Bulletin de salaire | 5 ans | CO art. 958f |
| Facture | 10 ans | CO art. 958f + TVA |
| Document légal intérimaire (permis, AVS) | durée de collaboration + 2 ans | nLPD, minimisation |
| Candidature non retenue | 6 mois (avec consentement) ou suppression immédiate | nLPD |
| Logs applicatifs avec PII | 12 mois | nLPD, minimisation |
| Audit logs métier | 10 ans | LSE / CO |

## Registre des traitements — sections minimales

```markdown
## Traitement : Gestion des intérimaires
- Finalité : recrutement, affectation, paie, conformité
- Catégories de personnes : intérimaires (candidats, actifs, anciens)
- Catégories de données : identité, coordonnées, AVS, permis, diplômes, IBAN, historique missions, évaluations
- Destinataires : agence (gestionnaires, paie), clients finaux (nom + prénom uniquement), caisses sociales, administrations fiscales, MovePlanner (ID + disponibilités)
- Durée : voir tableau rétention
- Transferts hors Suisse : non
- Mesures de sécurité : chiffrement CMEK, MFA, audit log, pseudonymisation logs
- Sous-traitants : Infomaniak (hébergement CH), Swisscom (SMS, signature), Bexio (export compta), Sentry (télémétrie — sous réserve DPA vérifié)
```

## Pièges courants
- Utiliser un sous-traitant US (DocuSign, Twilio US, Sentry US sans configuration région EU/CH) sans DPA et sans clauses.
- Envoyer des exports CSV d'intérimaires par email non chiffré.
- Conserver indéfiniment parce qu'"on pourrait en avoir besoin". Chaque donnée doit avoir une durée.
- Oublier d'inclure l'adresse IP dans le registre (c'est une donnée personnelle selon la jurisprudence UE + nLPD alignée).
- Demander le consentement à l'intérimaire "par défaut" dans un check-box pré-cochée. Non valide.

## Références
- nLPD : https://www.fedlex.admin.ch/eli/cc/2022/491/fr
- PFPDT : https://www.edoeb.admin.ch
- Guide PME nLPD PFPDT
- `docs/01-brief.md §3.7`
