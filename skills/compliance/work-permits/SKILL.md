# Skill — Permis de travail suisses

## Rôle
RH / juriste. Valide que chaque intérimaire a le droit de travailler, suit les expirations, alerte à temps.

## Quand l'utiliser
Onboarding d'un intérimaire, acceptation de mission, job mensuel de scan, contrôle SECO.

## Concepts clés
- **Citoyen CH** : pas de permis. Droit complet.
- **C — Établissement** : UE/AELE après 5 ans, autres après 10 ans. Droit complet, pas de limite.
- **B — Séjour** : 1 an, renouvelable. Typiquement UE/AELE. Titulaire a le droit de travailler partout en Suisse (pour UE/AELE) ou dans son canton (pour État tiers, activité limitée).
- **L — Courte durée** : ≤ 12 mois, rarement renouvelable. Souvent saisonnier. Contraintes sur employeur déclaré.
- **G — Frontalier** : travail en Suisse, domicile en zone frontalière d'un pays limitrophe. Zone restreinte.
- **Ci** : conjoint d'un fonctionnaire international, règles spécifiques.

## Règles dures
- **Pas de mission sans permis valide** sur toute la durée de la mission. Le système refuse l'acceptation si `permit.expiresAt < mission.dateTo`.
- **Alerte** automatique :
  - Permis L : **J-30** (renouvellement rare, souvent blocage)
  - Permis B : **J-60** (temps pour renouveler)
  - Permis C : pas d'expiration mais **contrôle à 5 ans** pour le "livret"
  - Permis G : **J-30**
- Le **numéro de permis** et sa **copie scannée** sont stockés (chiffrés).
- Pour les **non-UE/AELE**, vérifier la mention d'activité autorisée sur le livret (permis limité à certaines activités ou à un employeur).

## Données à tracer

```
temp_worker_permits
  id
  worker_id
  permit_type  enum(CH, C, B, L, G, Ci, Other)
  permit_number
  issued_by_canton
  issued_at  date
  expires_at  date NULL  -- NULL pour C
  scope       text         -- secteur/employeur si restrictif
  document_uri
  status      enum(valid, expiring, expired, revoked)
  created_at / updated_at
```

## Pratiques
- Job cron quotidien `OPS.permit-expiry-scan` : met à jour `status`, envoie alertes (gestionnaire + intérimaire) selon seuils.
- À l'acceptation de mission : vérification en **temps réel** contre `expires_at ≥ mission.dateTo`.
- Le permis scanné est conservé avec chiffrement CMEK (comme tout document sensible).
- Pour les permis G, vérifier la **zone frontalière** (liste cantons limitrophes) vs le lieu de mission — sortie de zone = violation.

## Cas particuliers à gérer
- **Permis en cours de renouvellement** : l'intérimaire dispose d'une attestation provisoire. Le système peut accepter sous condition de date limite d'attestation + alerte RH prioritaire.
- **Changement de canton de travail** pour un permis B État tiers : autorisation à redemander.
- **Travail d'étudiant** avec permis B étudiant : limite de 15 h/sem hors vacances académiques — contrainte à tracer côté LTr.

## Pièges courants
- Oublier le lien permis ↔ canton pour État tiers → mission interdite légalement.
- Considérer un permis C comme "sans date" sans notice de contrôle 5 ans → livret périmé = document invalide.
- Accepter un permis G pour mission hors zone frontalière → interdit.
- Stocker la copie sans chiffrement.

## Références
- SEM (Secrétariat d'État aux migrations) : https://www.sem.admin.ch
- LEI : Loi fédérale sur les étrangers et l'intégration
- `docs/01-brief.md §3.5`
