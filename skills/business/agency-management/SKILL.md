# Skill — Management opérationnel d'agence

## Rôle
Responsable d'agence / dispatcher senior. Pilote les opérations quotidiennes : placement, suivi mission, qualité, relation client, escalades.

## Quand l'utiliser
Prompts touchant à : dashboard propositions, workflow d'affectation (pass-through vs contrôle), suivi missions en cours, gestion d'incident, relation client.

## Concepts clés
- **Matching** : le bon intérimaire au bon moment au bon client. C'est le cœur de la valeur ajoutée.
- **Mode pass-through** vs **mode contrôlé** : configurable par client. Pass-through = l'intérimaire reçoit directement la proposition par SMS MovePlanner. Contrôlé = l'agence valide avant.
- **Escalade** : certains clients veulent un point de contact humain 24/7 pour les incidents. À provisionner.
- **Astreinte** : en déménagement/BTP, les urgences arrivent (maladie matinale, changement dernière minute). L'agence doit être joignable.

## Règles dures
- Toute proposition acceptée → contrat de mission généré **dans l'heure**. Sans contrat, pas de couverture légale ni LAA.
- Tout incident (retard, absence, accident) → log dans le système avec horodatage, informer le client dans le délai contractuel (souvent 30 min).
- Aucun intérimaire n'est envoyé en mission **sans** : permis valide, certifs métier (SST, CACES), AVS enregistré, affiliation caisse sociale active.

## Dashboards à suivre (live)

1. **Propositions en attente** : triées par deadline croissante, surlignées rouge si < 15 min restant.
2. **Missions du jour** : statut (confirmée, en cours, terminée), alertes si retard d'arrivée > 15 min.
3. **Documents expirants** : permis, SST, CACES à J-60/30/7.
4. **Timesheets à contrôler** : tri par ancienneté (plus vieux d'abord).
5. **Disputes** : ouvertes, en cours, résolues sem.

## Workflow — traitement d'une proposition en mode contrôlé

1. Webhook `worker.assignment.proposed` reçu → dashboard allumé.
2. Dispatcher lit : intérimaire, mission, taux, horaires. Vérifie la compatibilité (LTr, permis, évaluations précédentes du worker chez ce client).
3. Deux options :
   - **Accepter pour l'intérimaire** : POST `/assignments/{id}/response` action=accepted. Notifie l'intérimaire par SMS (canal agence) et par email.
   - **Refuser** : POST action=refused avec motif (ex. "indisponibilité déclarée tardivement").
4. Si accept, génération auto du contrat de mission (A.4).
5. Suivi de la signature OTP par l'intérimaire.
6. Confirmation au chef d'équipe MovePlanner (via MP).

## Relation client
- **SLA** typique : première proposition < 30 min pour mission dans les 24h, < 4h pour mission à +48h.
- **Reporting** : envoi hebdo au client (CSV ou portail) : heures facturées, intérimaires placés, incidents, disputes.
- **Revue mensuelle** : avec les clients principaux (MovePlanner en tête), KPIs partagés.

## Pièges courants
- Laisser les propositions dormir dans le dashboard → timeout → chute du taux de placement.
- Accepter des missions au pire moment (fatigue intérimaire, enchaînement sans repos 11h). Le système doit bloquer, pas le dispatcher seul.
- Oublier de documenter les disputes → le client argue, l'agence n'a rien à produire.
- Négliger les évaluations post-mission côté chef d'équipe MP. C'est le carburant du `reliabilityScore`.

## Références
- `docs/02-partners-specification.md §5`, `§6`
- `docs/01-brief.md §4.3`, `§4.4`
- `skills/business/agency-sales/SKILL.md`
