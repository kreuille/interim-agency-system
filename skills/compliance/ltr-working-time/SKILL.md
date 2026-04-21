# Skill — LTr (Loi sur le travail) et durée du travail

## Rôle
Juriste social. Veille au respect de la LTr et ses ordonnances pour tous les intérimaires placés.

## Quand l'utiliser
Calcul d'heures, détection d'anomalies sur un timesheet, création de contrat de mission, planning, alertes.

## Concepts clés
- **LTr** : loi fédérale sur le travail, encadre durée, repos, nuit, dimanche.
- **Durée max** : 45 h/sem pour employés de bureau/industrie ; **50 h/sem** pour bâtiment, déménagement, transport, hôtellerie.
- **Durée quotidienne** : max ~9 h (avec étalement possible).
- **Repos quotidien** : **11 h consécutives** minimum.
- **Repos hebdomadaire** : 35 h (dimanche et une partie du samedi généralement).
- **Pause** : 15 min si journée > 5h30, 30 min si > 7h, 1h si > 9h. Non payée si l'employé peut quitter son poste.
- **Nuit** : 23h–6h. Majoration 25% en argent **ou en temps** selon durée d'affectation à la nuit.
- **Dimanche** : en principe interdit, majoration 50% en cas d'autorisation.
- **Heures supplémentaires** : au-delà de la durée contractuelle hebdo, majoration 25% en argent **sauf compensation** convenue en temps.

## Règles dures
- Le système **refuse** d'affecter un intérimaire qui aurait > 50 h/sem cumulées (toutes missions confondues).
- Le système **détecte** et signale :
  - pause manquante < 30 min pour > 7 h travaillées,
  - repos < 11 h entre deux missions,
  - travail de dimanche sans autorisation enregistrée,
  - travail de nuit sans compensation.
- Les **majorations** sont calculées automatiquement par le moteur de paie selon les règles LTr **et** les règles CCT si celles-ci sont plus favorables (la plus favorable gagne).

## Anomalies à détecter

| Anomalie | Seuil | Action |
|----------|-------|--------|
| Dépassement hebdo | > 50 h/sem cumulées toutes missions | Blocage proposition / alerte rouge |
| Repos quotidien insuffisant | < 11 h entre fin J et début J+1 | Alerte rouge, blocage acceptation sans dérogation |
| Pause manquante | 0 min si > 7 h | Signaler sur timesheet, à corriger ou justifier |
| Nuit non déclarée | 23h–6h sans majoration | Recalcul et correction |
| Dimanche non déclaré | dim sans majoration | Recalcul et correction |

## Données à tracer
Timestamps précis début/fin par plage travaillée, pauses minutées, flag nuit/dim automatique calculé depuis `actualStart/End` et jours fériés cantonaux.

## Pratiques
- Le calcul "nuit" considère toute minute entre 23h et 6h locales (Europe/Zurich).
- Le calcul "dimanche" considère la plage 23h sam → 23h dim selon LTr art. 18.
- Le cumul hebdo se fait en **ISO week** (lun–dim).
- Si plusieurs missions/clients dans la semaine, somme **globale** côté agence.

## Pièges courants
- Calculer "nuit" en heures civiles (00h–6h) → faux en Suisse.
- Ignorer le repos de 11h entre fin mission J et début mission J+1 (souvent violé en déménagement).
- Arrondir les heures au quart d'heure pour "simplifier" → litige potentiel. Garder la précision minute.
- Ne pas distinguer heures sup (>contrat) et heures supplémentaires LTr (>50h/sem) : les deux déclenchent des règles différentes.

## Références
- LTr : https://www.fedlex.admin.ch/eli/cc/1966/57_57_57/fr
- OLT 1, 2, 3, 4 : ordonnances d'exécution
- SECO, directive durée du travail
- `docs/01-brief.md §3.3`
