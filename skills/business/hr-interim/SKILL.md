# Skill — RH d'agence d'intérim

## Rôle
Responsable RH / recruteur. Sourcing, sélection, onboarding, suivi, fidélisation des intérimaires.

## Quand l'utiliser
Prompts sur : CRUD intérimaire, documents, qualifications, alertes, évaluation, reliability score, turnover.

## Concepts clés
- **Sourcing** : LinkedIn, annuaires pros, salons emploi, bouche-à-oreille (le meilleur canal en intérim métier).
- **Sélection** : entretien, vérification documents, test métier (notamment conduite pour chauffeurs, SUVA SST pour BTP), références.
- **Onboarding** : livret d'accueil, charte qualité, présentation CCT, consignes HSE, équipement (chaussures, gants, gilet haute visibilité).
- **Fidélisation** : qualité du placement (matching), transparence paie hebdo, formation continue (CACES, VCA, SST).
- **Évaluation** : feedback chef d'équipe après chaque mission → reliabilityScore.

## Processus onboarding standard

1. Première entrevue (45 min) : motivation, dispo, qualifications, zone géographique.
2. Collecte documents : pièce ID, permis travail, AVS, LAMal, IBAN, diplômes/certifs, extrait casier (si BTP).
3. Vérifications : validité permis, authenticité diplômes clés, références 2 derniers employeurs.
4. Test métier si applicable (conduite, manutention, SST).
5. Signature contrat cadre employé intérimaire (pas mission — contrat d'embauche agence).
6. Déclaration aux caisses sociales (AVS, LAA, LPP le cas échéant, IS).
7. Remise EPI + livret d'accueil.
8. Ouverture du profil dans le SI, saisie dispos initiales.

## Données à tracer par intérimaire
- Identité complète, AVS, IBAN, canton de domicile (pour IS).
- Documents scannés (permis, diplômes, certifs) + dates d'expiration.
- Qualifications CCT (codes officiels).
- Permis de conduire par catégorie (B, C1, C, CE, D) + date d'expiration livret.
- Certifications métier : CACES, VCA, SST, permis cariste, habilitation électrique, etc.
- Historique missions, évaluations chef d'équipe (note + commentaire).
- Score de fiabilité calculé (voir `docs/02-partners-specification.md §6.4`).
- Préférences (zones géo, jours indispo récurrents, plage horaire préférée).

## Règles dures
- Aucune mission avant signature du contrat cadre employé + déclaration AVS/LAA active.
- Aucun envoi en mission BTP sans carte SUVA SST valide.
- Aucun envoi chauffeur sans permis correspondant + **carte de qualification** (CQC) et **carte tachygraphique** si véhicules >3.5t.
- Les évaluations chef d'équipe sont systématiquement demandées — pas optionnelles.

## Pratiques de fidélisation (intérim = secteur à turnover haut)
- **Paie fiable et ponctuelle** (vendredi, pas de retard même 1 jour).
- **Mission prévisible** : communiquer au maximum à l'avance.
- **Transparence** : accès portail PWA pour voir planning, bulletin, solde heures sup.
- **Formation** : financer 1–2 formations CACES/SST/VCA par an pour les profils à fort ROI.
- **Prime de fidélité** pour les intérimaires ≥ 6 mois actifs (forfait, hors CCT 13ᵉ).
- **Check-in trimestriel** humain (appel 15 min) pour les top profils.

## Pièges courants
- Recruter sans vérifier la carte SUVA → accident = sinistre non couvert correctement.
- Laisser des docs expirer → placement illégal.
- Score de fiabilité calculé mais non exploité dans le matching.
- Pas de feedback au bout d'un mois d'une mauvaise évaluation → l'intérimaire reprend une mission chez le même client et re-rate.
- Négliger le 1er entretien → mauvais matching → turnover précoce.

## Références
- `docs/01-brief.md §4.1`
- `skills/compliance/work-permits/SKILL.md`
- `skills/compliance/cct-staffing/SKILL.md`
- SUVA SST / VCA : https://www.suva.ch
