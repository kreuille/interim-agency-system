# Skill — LSE et autorisation cantonale

## Rôle
Juriste social / DPO. Maîtrise la LSE (Loi fédérale sur le service de l'emploi et la location de services) et son application opérationnelle.

## Quand l'utiliser
Toute décision qui touche à : qui peut exploiter l'agence, à quelles conditions, dans quel canton, avec quelle autorisation, avec quels contrôles du SECO / des offices cantonaux.

## Concepts clés
- **Location de services** = l'agence met son personnel (ses salariés) à disposition d'entreprises tierces, en conservant la qualité d'employeur (salaires, cotisations, responsabilité).
- **Placement** = mise en relation entre candidat et futur employeur. Moins contraignant. Nous faisons principalement de la **location de services**.
- **Autorisation cantonale** : obligatoire pour la location de services. Délivrée par le SCTP / OCE / office cantonal de l'emploi du canton du siège.
- **Autorisation fédérale** : en plus, si location depuis ou vers l'étranger. Délivrée par le SECO.
- **Caution** : dépôt bancaire (typiquement 50'000 CHF pour la location de services simple, plus pour location internationale).

## Règles dures
- **Pas d'activité sans autorisation valide**. Le système refuse toute création de contrat de mission si l'autorisation de l'agence est expirée ou absente.
- Le numéro d'autorisation figure obligatoirement sur : contrats de mission, factures, papier à en-tête.
- Conservation des contrats de mission : **10 ans** (obligation LSE).
- Registre des travailleurs loués mis à disposition : **à jour en permanence**, consultable par le SECO à tout moment (export en 1 clic requis).
- Pas de CDD interdits déguisés en location de services. Si l'intérimaire travaille > 6 mois pour le même client, la LSE exige vigilance spécifique (requalification possible).

## Données à tracer dans le système

Table `lse_authorizations` (champs minimum) :

```
id                      uuid
agency_id               uuid
authorization_type      enum(cantonal, federal)
authorization_number    text
issuing_authority       text      -- "SCTP Genève", "SECO", etc.
canton                  char(2)   -- pour cantonal
issued_at               date
expires_at              date
scope                   text      -- limitations éventuelles
document_uri            text      -- PDF scan du papier
deposit_amount_rappen   bigint    -- caution bancaire
status                  enum(active, expiring_soon, expired, revoked)
created_at / updated_at timestamptz
```

## Pratiques
- **Alerte** automatique 60 j avant `expires_at` → email au fondateur + ticket JIRA/Linear.
- **Blocage** dur des nouveaux contrats de mission à J-0 de l'expiration (feature flag + tests dédiés).
- **Export SECO** : liste de tous les intérimaires actuellement en mission avec : nom, prénom, AVS, permis, client, lieu, date début, durée prévue, taux. Format PDF + CSV.
- **Onboarding d'une agence tenant** : le premier `lse_authorizations` actif avec `expires_at` future est condition d'activation du tenant.

## Pièges courants
- Confondre placement et location de services → autorisations différentes, registres différents.
- Oublier la re-demande d'autorisation à l'expiration (délais de traitement 2–3 mois selon canton).
- Ne pas inscrire le numéro d'autorisation sur les documents (non-conformité facile à corriger mais récurrente).
- Autoriser une mission à l'étranger sans autorisation fédérale.
- Ne pas conserver les contrats 10 ans (suppression prématurée = violation).

## Références
- LSE : https://www.fedlex.admin.ch/eli/cc/1991/392_392_392/fr
- OSE : ordonnance d'exécution
- SECO : https://www.seco.admin.ch
- swissstaffing : https://www.swissstaffing.ch
- `docs/02-partners-specification.md §2.1`
- `docs/01-brief.md §3.1`
