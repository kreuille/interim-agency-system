# Skill — SUVA et sécurité au travail (LAA)

## Rôle
Responsable sécurité / RH. Garantit la couverture SUVA et la prévention des accidents des intérimaires.

## Quand l'utiliser
Onboarding worker, envoi en mission BTP/déménagement, déclaration accident, contrôle attestations annuelles.

## Concepts clés
- **SUVA** : assureur-accidents obligatoire pour les secteurs dangereux (BTP, transport, industrie lourde, forêt…). Les autres secteurs → assureur privé agréé.
- **LAAP** (professionnel) : à la charge de **l'employeur** (l'agence). Couvre accidents du travail + maladies professionnelles.
- **LAANP** (non-professionnel) : à la charge du **salarié** (~1–2% du brut), obligatoire dès 8h/sem moyenne. Pour les missions courtes sous ce seuil, couverture LAMal maladie couvre les accidents non-pro.
- **SST** (Sécurité au Travail) : formation SUVA obligatoire pour les travaux à risque (hauteur, échafaudage, conduite engins, conditionnement lourd).
- **MSST** : Médecin et Spécialistes Sécurité au Travail, directives sectorielles à suivre.

## Règles dures
- **Affiliation SUVA** obligatoire pour toute agence d'intérim qui place en BTP / transport / déménagement (activité soumise à la LAA obligatoire).
- **Carte SUVA SST** valide pour chaque intérimaire placé en chantier — le système **refuse** l'acceptation de mission si SST absente ou expirée.
- **Déclaration d'accident** : ≤ 8 jours à la SUVA. Forme électronique via Sunet (e-formulaire) ou Swissdec.
- **Équipements de Protection Individuelle (EPI)** : fournis par l'employeur (= agence) ou le client selon contrat. Le contrat de mission doit **préciser** qui fournit quoi.

## Données à tracer

```
worker_safety_certifications
  id, worker_id, type (sst, caces_r486, caces_r487, vca, …)
  issued_at, expires_at, certificate_uri
  issuing_body (SUVA, SUVA Liss, SUVA chantiers)
  status (valid, expired, revoked)
```

## Flux accident de travail

```
1. Incident signalé (via app chef équipe MP ou portail intérimaire)
2. Enregistrement WorkerIncident côté agence
3. Déclaration SUVA Sunet sous 8 jours
4. Certificat médical reçu → archivé GED (données santé → accès restreint DPO)
5. Suivi arrêts maladie, reprise, indemnités
6. Clôture dossier, mise à jour reliability score
```

## Pratiques
- **Briefing sécurité** fourni à l'intérimaire avant première mission BTP : consignes, EPI, référent client.
- **Visite médicale d'embauche** : pas obligatoire sauf activités spécifiques (nuit régulière → visite obligatoire).
- **Statistiques accidents** : tableau de bord mensuel, identifier clients/types de missions à risque → ajuster prime SUVA (coefficient de bonus-malus).
- **Prime SUVA** : variable selon classe de risque entreprise + sinistralité. Reporting annuel à l'agence.

## Pièges courants
- Placer un intérimaire BTP sans SST valide → accident = couverture contestée.
- Oublier la déclaration sous 8 jours → pénalités SUVA.
- Confondre LAAP (employeur paie) et LAANP (salarié paie). Beaucoup d'erreurs de paie viennent de là.
- Ne pas exiger EPI → responsabilité employeur engagée.
- Accident non-pro d'un worker < 8h/sem : ne pas déclarer à SUVA, renvoyer LAMal.

## Références
- SUVA : https://www.suva.ch
- LAA : https://www.fedlex.admin.ch/eli/cc/1982/1676_1676_1676/fr
- `skills/compliance/social-insurance/SKILL.md`
- `skills/business/hr-interim/SKILL.md`
- `docs/01-brief.md §3.4`
