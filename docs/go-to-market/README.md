# Go-to-market — livrables externes

> **Statut** : documents de préparation des actions externes à conduire par le fondateur avant go-live pilote.
> **Date** : 2026-04-23
> **Responsable** : fondateur (+ juriste / devops freelance selon documents)

Ces documents préparent les 4 actions externes bloquantes ou retardantes identifiées en fin de phase dev :

| # | Document | Débloque | Délai |
|---|----------|----------|-------|
| 1 | `01-lse-dossier-cantonal-checklist.md` | Exploitation commerciale légale (BLOCKER-002) | 2-3 mois |
| 2 | `02-gcp-provisioning-checklist.md` | A0.4 — hébergement prod | 1-2 semaines |
| 3 | `03-email-moveplanner-sandbox-request.md` | BLOCKER-001 — sandbox MP | 1-2 semaines |
| 4 | `04-bexio-vs-abacus-comparatif.md` | A5.5 — ELM Swissdec via logiciel certifié | 2-4 semaines |
| 5 | `05-pentest-scope-rfp.md` | A6.6 — audit sécu avant go-live | 3 semaines |
| 6 | `06-plan-communication-pilote.md` | A6.7 — go-live pilote | pour le jour J |

## Ordre d'attaque recommandé

**Lundi matin, cette semaine** :
1. Finaliser et envoyer le dossier LSE (doc 1) — c'est le plus long, faut démarrer tout de suite.
2. Envoyer l'email sandbox à MovePlanner (doc 3) — 2 minutes, réponse probable sous 1 semaine.

**Cette semaine** :
3. Créer le compte GCP et signer le DPA (doc 2) — 1-2h.
4. Commencer à lire le comparatif Bexio vs Abacus (doc 4) et demander demos.

**Semaine prochaine** :
5. Lancer le provisioning GCP effectif (seul ou avec devops freelance).
6. Contractualiser Bexio (ou Abacus).
7. Cadrer le pentest (doc 5) et contacter 2-3 prestataires pour devis.

**Semaine 4-5** :
8. Pentest staging en cours pendant que LSE mûrit et ELM s'affilie.

**Semaine 7-9** :
9. Go-live pilote (doc 6) quand tout converge.

## Principes

- **Rien ne démarre en prod sans LSE active.** Le système est prêt mais l'exploitation commerciale est illégale sans autorisation cantonale.
- **Une action externe en attente n'empêche pas les autres d'avancer.** Maximiser le parallélisme.
- **Un devops freelance 3-5 k CHF est un bon investissement** pour A0.4 si tu n'es pas à l'aise avec GCP. Ne perds pas 2 semaines à apprendre `gcloud` en solo.
