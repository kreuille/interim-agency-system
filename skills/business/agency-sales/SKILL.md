# Skill — Sales agence d'intérim

## Rôle
Commercial / business developer. Prospecte, négocie, cadre le contrat, suit le compte.

## Quand l'utiliser
Prompts touchant CRM client, grille tarifaire, contrats cadre, pipeline, renouvellement, reporting client.

## Concepts clés
- **Grille tarifaire** par branche × qualification × canton × plage horaire. Porte le coefficient agence × minimum CCT.
- **Contrat cadre** : conditions commerciales long terme (durée, paiement, pénalités, SLA, confidentialité).
- **Cycle de vente B2B PME suisse** : 2 à 8 semaines typique pour un premier contrat, plus rapide pour un client pilote.
- **Upsell** : intérimaires permanents, bascule vers "à demeure", formations, multi-sites.
- **Cross-sell** : proposer qualifications supplémentaires (ex. chauffeurs C1 en plus des déménageurs).

## Pipeline commercial standard

1. **Prospection** : liste nominative PME BTP/déménagement CH Romande (LinkedIn Sales Nav, annuaires cantonaux, bouche-à-oreille).
2. **Qualification** : volume estimé (heures/sem), branche, canton, maturité RH, outil planning (MovePlanner ou concurrent).
3. **Démo** : 30 min, visio. Axée sur la réactivité (différenciateur). Montrer le flux push-MP → proposition → accept → contrat.
4. **Proposition** : document PDF avec grille tarifaire personnalisée, SLA, engagement GDPR/nLPD, coordonnées référents.
5. **Négociation** : coefficient, délai paiement (standard 30 j, négociable 45 j grand compte), pénalités intérimaire no-show.
6. **Signature** : contrat cadre.
7. **Onboarding** : paramétrage client dans le SI (grille, contacts, canaux notif), test technique, première mission pilote.

## Grille tarifaire type (illustrative, à affiner par marché réel)

| Branche | Qualification | Base CCT (CHF/h) | Coef. client premium | Prix facturé (CHF/h) |
|---------|---------------|------------------|---------------------|---------------------|
| Déménagement | Manœuvre | 25.00 | 1.85 | 46.25 |
| Déménagement | Déménageur qualifié | 28.50 | 1.85 | 52.75 |
| Déménagement | Chef d'équipe | 32.00 | 1.90 | 60.80 |
| BTP gros œuvre | Manœuvre | 29.00 | 2.00 | 58.00 |
| Chauffeur C1 | | 31.50 | 1.95 | 61.45 |

*(montants illustratifs 2026 — à vérifier CCT à jour)*

## Données à tracer
- Pipeline (CRM léger ou table `sales_opportunities`) avec étape, montant espéré, date cible.
- Contrats cadre signés + avenants.
- Grilles tarifaires versionnées (effet à date).
- NPS client, enquêtes trimestrielles.

## Pratiques
- Pas de remise sur le coefficient < 1.75 sans validation direction (contrôle dans le système).
- Clause d'audit CCT dans le contrat cadre (le client peut exiger la preuve que les intérimaires sont payés au minimum).
- Contrat cadre avec **clause d'exclusivité mission** : si proposé, l'intérimaire doit prendre la mission du client (sauf CCT/LTr). Négociable.
- **Pénalités no-show** : symétriques, typique 100 CHF si intérimaire absent injustifié, 100 CHF si client annule < 24h.
- Envoi automatique des factures QR-bill, relance J+7/J+15/J+30 automatisée.

## Pièges courants
- Survendre la disponibilité ("on peut vous trouver 20 intérimaires demain"). Dégradation de la réputation au premier échec.
- Grille tarifaire non versionnée → litige sur factures.
- Contrat cadre trop favorable au client (pénalités asymétriques, exclusivité sans contrepartie, SLA irréaliste).
- Absence de clause de révision annuelle — impossible de répercuter hausse CCT.

## Références
- `docs/01-brief.md §4.2`
- `skills/compliance/cct-staffing/SKILL.md`
- `skills/business/agency-management/SKILL.md`
