# Registre des risques

> **Version** : 1.0 — 2026-04-21
> **Échelle** : Impact (1 faible → 5 critique) × Probabilité (1 rare → 5 quasi-certain). Sévérité = I × P. Rouge ≥ 15, Orange 9–14, Jaune 4–8, Vert < 4.
> **Mise à jour** : à chaque sprint planning (vendredi) et à chaque blocker ouvert.

---

## R-001 — Retard d'accès sandbox MovePlanner
- **Impact** : 5 / **Probabilité** : 3 / **Sévérité** : 15 🔴
- **Conséquence** : Sprint A.2 et A.3 bloqués, glissement de 2–4 semaines.
- **Mitigation** : mock server OpenAPI local (`apps/mock-moveplanner/`) reproduisant contrats entrée/sortie. Dev A.2 continue sur mock. Contrat écrit rejoué en CI dès sandbox dispo.
- **DRI** : PO / fondateur.

## R-002 — Autorisation cantonale LSE non obtenue à temps
- **Impact** : 4 / **Probabilité** : 3 / **Sévérité** : 12 🟠
- **Conséquence** : impossibilité d'exploiter commercialement le pilote. Code prêt mais usage illégal.
- **Mitigation** : dépôt dès mois 1 (délai 2–3 mois). Fallback portage via agence autorisée partenaire pendant 60 j.
- **DRI** : fondateur + juriste.

## R-003 — Barèmes CCT publiés en retard ou majoration légale en cours d'année
- **Impact** : 3 / **Probabilité** : 4 / **Sévérité** : 12 🟠
- **Conséquence** : paies calculées avec mauvais taux, régularisations rétroactives, contrôle swissstaffing.
- **Mitigation** : abonnement swissstaffing, table `cct_minimum_rates` versionnée par date, tests non-régression à chaque import, prompt `OPS.cct-yearly-update` annuel.

## R-004 — Fournisseur signature ZertES indisponible
- **Impact** : 4 / **Probabilité** : 2 / **Sévérité** : 8 🟡
- **Conséquence** : contrats de mission non signables → missions non juridiquement couvertes.
- **Mitigation** : SLA contractuel Swisscom, fournisseur secondaire pré-intégré (Skribble), fallback signature manuscrite scannée accepté 48h.

## R-005 — Dépendance MovePlanner pour le CA (concentration client)
- **Impact** : 5 / **Probabilité** : 3 / **Sévérité** : 15 🔴
- **Conséquence** : perte MP = perte d'activité quasi totale les 18 premiers mois.
- **Mitigation** : architecture multi-client dès le départ, diversification clients (2 autres clients signés à M+6 visés), clause de durée minimale dans contrat MP (9 mois min).

## R-006 — Fuite de données personnelles (nLPD)
- **Impact** : 5 / **Probabilité** : 2 / **Sévérité** : 10 🟠
- **Conséquence** : amende PFPDT, annonce 72h, perte de confiance clients, plainte intérimaires.
- **Mitigation** : chiffrement CMEK, MFA obligatoire rôles sensibles, pseudonymisation logs, audit trimestriel interne, pentest avant go-live, runbook `secret-leaked.md` joué en gameday.

## R-007 — Intégration ISO 20022 / pain.001 rejetée par la banque
- **Impact** : 4 / **Probabilité** : 3 / **Sévérité** : 12 🟠
- **Conséquence** : virements salaires non exécutés, retard paie, turnover intérimaires.
- **Mitigation** : validation XSD en local avant soumission, test banque sandbox, monitoring pain.002, runbook `payment-file-rejected.md`, cache CHF liquide 2 semaines de paie.

## R-008 — Recrutement dev TypeScript senior CH romand difficile
- **Impact** : 3 / **Probabilité** : 4 / **Sévérité** : 12 🟠
- **Conséquence** : retard build, surcharge des 2 premiers devs, dette technique.
- **Mitigation** : ouverture remote CH romande + France frontalière, partenariat avec EPFL/HES-SO, budget consultant bouche-trou 4 semaines.

## R-009 — Défaillance comptabilité / facturation en fin de mois
- **Impact** : 3 / **Probabilité** : 3 / **Sévérité** : 9 🟠
- **Conséquence** : factures non émises, trésorerie tendue, DSO qui explose.
- **Mitigation** : automatisation totale du cycle factu, dashboard de contrôle quotidien, comptable externe en renfort mensuel en Phase pilote.

## R-010 — Webhook storm MovePlanner (volumes imprévus)
- **Impact** : 3 / **Probabilité** : 2 / **Sévérité** : 6 🟡
- **Conséquence** : saturation des workers, backlog croissant, propositions expirées.
- **Mitigation** : rate limit entrant, scale horizontal BullMQ, DLQ + alerting, runbook `webhook-storm.md`.

## R-011 — Intérimaire pris hors zone (permis G hors zone frontalière)
- **Impact** : 3 / **Probabilité** : 3 / **Sévérité** : 9 🟠
- **Conséquence** : mission illégale, amende SEM, retrait d'autorisation possible.
- **Mitigation** : validation système bloquante sur geozone + permis, formation dispatchers, contrôle spot mensuel.

## R-012 — Changement de réglementation CCT en cours de projet
- **Impact** : 3 / **Probabilité** : 3 / **Sévérité** : 9 🟠
- **Conséquence** : refonte partielle du moteur de paie, coût supplémentaire.
- **Mitigation** : veille active (swissstaffing + SECO), conception modulaire du moteur de paie, budget 10% buffer.

## R-013 — Accidents de travail (LAA) mal notifiés
- **Impact** : 4 / **Probabilité** : 2 / **Sévérité** : 8 🟡
- **Conséquence** : couverture SUVA contestée, coûts de santé sur l'agence.
- **Mitigation** : process de déclaration accident 24h, formation gestionnaires, intégration Swissdec ELM pour annonce accidents.

## R-014 — DDoS sur endpoints publics (webhooks, portail)
- **Impact** : 2 / **Probabilité** : 2 / **Sévérité** : 4 🟡
- **Conséquence** : indisponibilité temporaire, frustration utilisateurs.
- **Mitigation** : Cloudflare ou équivalent devant, rate limit app, alerting.

## R-015 — Intérimaire fantôme (fraude identité)
- **Impact** : 4 / **Probabilité** : 1 / **Sévérité** : 4 🟡
- **Conséquence** : paie versée à un faux compte, fraude AVS.
- **Mitigation** : vérification pièce ID au onboarding, validation AVS croisée avec caisse, double contrôle IBAN.

---

## Matrice récapitulative

| ID | Risque | Sévérité | Statut | DRI |
|----|--------|----------|--------|-----|
| R-001 | Sandbox MP retard | 15 🔴 | Ouvert | PO |
| R-005 | Dépendance MP CA | 15 🔴 | Monitoring | Fondateur |
| R-002 | Autorisation LSE | 12 🟠 | Ouvert | Juriste |
| R-003 | Barèmes CCT | 12 🟠 | Monitoring | Lead tech |
| R-007 | pain.001 rejeté | 12 🟠 | À prévenir | Dev |
| R-008 | Recrutement | 12 🟠 | Ouvert | Fondateur |
| R-006 | Fuite nLPD | 10 🟠 | Monitoring | DPO |
| R-009 | Facturation | 9 🟠 | À prévenir | Lead tech |
| R-011 | Permis G zone | 9 🟠 | À prévenir | Dev |
| R-012 | Réglementation | 9 🟠 | Monitoring | Juriste |
| R-004 | ZertES | 8 🟡 | À prévenir | Lead tech |
| R-013 | LAA non notifié | 8 🟡 | À prévenir | Gestionnaire |
| R-010 | Webhook storm | 6 🟡 | À prévenir | Lead tech |
| R-014 | DDoS | 4 🟡 | Monitoring | SRE |
| R-015 | Intérimaire fantôme | 4 🟡 | À prévenir | RH |

---

**Fin du registre des risques v1.0** — mise à jour sprint par sprint.
