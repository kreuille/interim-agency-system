# Plan de communication pilote

> **Objectif** : industrialiser la communication autour du go-live pilote pour : cadrer les attentes, rassurer les intérimaires, informer le client, gérer les incidents proprement.
> **Durée d'application** : semaine -1 → semaine +4 du go-live.
> **Responsable** : fondateur (+ éventuelle assistance communication légère).

---

## 1. Publics et canaux

| Public | Canal principal | Fréquence | Ton |
|--------|-----------------|-----------|-----|
| Intérimaires pilote (1-3) | SMS + Email + portail PWA | À chaque événement | Chaleureux, clair |
| MovePlanner (client) | Email + appel direct fondateur | Hebdo + à chaque incident | Pro, transparent |
| Caisses sociales / SUVA | Courrier postal (obligations ELM) | Mensuel | Administratif |
| Direction / investisseurs | Email récap hebdo | Hebdo | Synthétique, chiffré |
| Public web | Page statut + site | Continu | Rassurant, sobre |
| Médias / presse | — | Pas avant post-mortem positif | — |

---

## 2. Messages aux intérimaires pilote

### 2.1 Email d'onboarding (J-7)

**De** : Fondateur <fondateur@monagence.ch>
**À** : prenom.nom@intérimaire.email
**Objet** : Bienvenue chez Agence Intérim — démarrage pilote la semaine du XX/YY

```
Bonjour [Prénom],

Merci d'être partant pour lancer avec nous la première semaine pilote de
l'Agence Intérim. Voici ce qui t'attend.

## Ton accès au portail

Dès demain, tu recevras un SMS avec un lien magique pour accéder à ton
portail personnel sur ton téléphone : https://m.monagence.ch

Depuis ce portail tu pourras :
- Déclarer tes disponibilités semaine par semaine,
- Recevoir et accepter les propositions de mission en quelques tapotis,
- Signer ton contrat de mission par SMS (code OTP),
- Consulter tes bulletins de salaire chaque vendredi.

## Ce qu'on attend de toi

- Saisir tes dispos dimanche soir pour la semaine d'après.
- Confirmer/refuser rapidement les propositions (≤ 30 min en journée).
- Poser des questions : c'est un pilote, tes retours sont précieux.

## Ce qu'on te promet

- Une paie **chaque vendredi**, ponctuelle, sur ton compte lundi matin.
- Un contrat écrit **avant chaque mission** (pas de travail au noir).
- Un interlocuteur humain : moi, [Prénom fondateur], joignable au
  +41 XX XXX XX XX du lundi au samedi de 07h00 à 21h00. Pour les urgences
  (accident, retard client, conflit sur une mission) : appelle, ne mail pas.

## Ton premier rendez-vous

Lundi XX/YY à 09h00 dans nos locaux : [adresse]. 45 minutes. On signe ton
contrat-cadre d'engagement, on valide tes documents, on te remet ton kit
(chaussures, gilet HV, livret d'accueil).

Merci de ta confiance. À lundi.

[Fondateur]
Agence Intérim SA
+41 XX XXX XX XX
```

### 2.2 SMS standards (templates)

```
Dispo OK : "AgenceX: dispo {date} {créneau} bien reçue. Tu seras visible aux clients."

Proposition : "AgenceX: mission {date} {ville} {créneau} à {CHF}/h. Accepter avant {heure} : https://m.monagence.ch/p/{token}"

Confirmation accept : "AgenceX: mission {date} confirmée. Adresse RDV et détails : https://m.monagence.ch/mission/{id}"

Contrat à signer : "AgenceX: code signature contrat {code}. Valide 10 min. Ne partage pas."

Paie prête : "AgenceX: paie semaine {N} prête ({CHF} CHF net). Bulletin : https://m.monagence.ch/paie"

Incident : "AgenceX: on voit qu'il y a eu un souci sur ta mission {date}. Je t'appelle dans 10 min."
```

### 2.3 Email de fin de semaine pilote (J+7)

```
Bonjour [Prénom],

Première semaine pilote terminée. Voici ce qu'on a vu ensemble :

- Tu as effectué {N} missions chez {client}.
- Tu as travaillé {H} heures.
- Ta paie nette est de {CHF} CHF, virée ce soir, créditée lundi matin.

Merci pour ta ponctualité et tes retours. Le pilote continue la semaine
prochaine. Pour ton feedback sincère, appelle-moi quand ça t'arrange — je
veux savoir ce qui marche, ce qui ne marche pas.

[Fondateur]
```

---

## 3. Communication avec MovePlanner (client)

### 3.1 Email de kick-off pilote (J-3)

**À** : contact commercial + contact technique MP
**Objet** : Kick-off pilote intérim — semaine du XX/YY — coordination opérationnelle

```
Bonjour,

Nous démarrons lundi XX/YY la phase pilote avec nos 3 premiers intérimaires
réels. Quelques éléments de cadrage :

## Engagement SLA pendant le pilote

- Première proposition reçue → envoi SMS intérimaire : ≤ 5 min.
- Confirmation accept → signature contrat + contrat disponible : ≤ 60 min.
- Timesheet reçu → contrôle + signature ou dispute : ≤ 24h ouvrées.
- Escalade accident / absence : SMS + appel au chef d'équipe concerné
  ≤ 30 min après détection.

## Contact opérationnel pendant le pilote

- [Fondateur] — +41 XX XXX XX XX — 07h00-21h00, 7j/7.
- Email ops quotidienne : ops@monagence.ch — réponse ≤ 2h ouvrées.
- Astreinte nocturne pilote (22h00-07h00) : +41 XX XXX XX XX, uniquement
  urgences (accident, fuite de sécu).

## Reporting hebdo

Chaque vendredi 18h je vous envoie un email avec :
- Missions prises / refusées / timeout.
- Heures facturées estimées.
- Incidents s'il y en a (disputes, retards, absences).
- KPIs : taux de placement, temps moyen de réponse, NPS intérimaire (si
  enquête passée).

## Remontées d'incident

Si vous constatez un problème côté produit (webhook non reçu, API lente,
donnée incohérente) : envoyez à incidents@monagence.ch avec horodatage +
requestId si vous l'avez. J'ouvre un ticket immédiatement.

Bonne pilote à tous.

Cordialement,
[Fondateur]
```

### 3.2 Template reporting hebdo vendredi

**Objet** : Reporting pilote semaine {N} — Agence Intérim × MovePlanner

```
Bonjour,

Synthèse de la semaine {N} (du lundi {date} au dimanche {date}).

## Chiffres clés
- Missions proposées par MP : {N}
- Missions confirmées : {N} ({P}%)
- Missions refusées : {N} (motifs : {liste courte})
- Missions timeout : {N}
- Heures facturées : {H} h
- CA HT généré : CHF {montant}

## KPIs
- Temps moyen de réponse proposition → accept : {X} min (cible < 30 min)
- Timesheets signés ≤ 24h : {P}% (cible > 95%)
- Disputes ouvertes : {N}
- Incidents P1 : {N} (cible 0)
- NPS intérimaire : {score} (sur {N} répondants)

## Faits saillants
- {Point positif 1}
- {Point à améliorer 1}
- {Décision à arbitrer, si applicable}

## Facturation
Facture de la semaine : AG-2026-NNNN, QR-bill en PJ, montant CHF {X} HT,
TVA 8.1% CHF {X}, total CHF {X}. Échéance {date}.

Je reste disponible pour en discuter.

Cordialement,
[Fondateur]
```

---

## 4. Email interne (direction / investisseurs si applicable)

### 4.1 Récap hebdo direction (format concis)

```
Semaine {N} pilote — Agence Intérim

État : {vert / orange / rouge}
Go-live pilote : J+{N} ({date de démarrage})

KPIs :
- 3 intérimaires actifs, {N} missions, {H}h facturées
- Taux placement {P}%, temps réponse {X} min
- Incidents P1 : {N}

Top 3 :
1. {point 1}
2. {point 2}
3. {point 3}

Décisions à prendre :
- {si applicable}

Trésorerie : CHF {X} en banque, run rate {Y} mois.
```

---

## 5. Page de statut publique

### 5.1 URL et stack

- `https://status.monagence.ch` — sous-domaine dédié.
- Stack : **Statuspage.io** (atlassian) ou **instatus.com** (plus abordable, 20 CHF/mois).
- 4 composants : API, Portail intérimaire, Back-office admin, Intégration MovePlanner.

### 5.2 Messages types

**Opérationnel** :
```
All systems operational — {datestamp}
```

**Incident en cours** :
```
Incident en cours — lenteur sur le portail intérimaire
Nous enquêtons sur un ralentissement du portail mobile. Les propositions de
mission sont toujours délivrées par SMS. Prochaine mise à jour dans 30 min.
Début : {datestamp}.
```

**Maintenance planifiée** :
```
Maintenance planifiée — {date} {heure} UTC
Nous allons déployer une mise à jour. Indisponibilité attendue < 5 min.
Aucune action requise de votre part.
```

**Incident résolu** :
```
Incident résolu — lenteur portail intérimaire
Cause : {résumé technique 1 phrase, jamais nominatif}. Correction appliquée
à {datestamp}. Le service est revenu à la normale. Un post-mortem public
sera publié sous 72h.
```

### 5.3 Qui peut poster

- Fondateur : tout.
- Lead tech : incidents + maintenance.
- Personne d'autre.

---

## 6. Template post-mortem public

À publier sur `https://status.monagence.ch/incidents/{id}` après tout P1 ou P2 long.

```markdown
# Post-mortem — {titre court de l'incident}

**Date** : {date de l'incident}
**Durée** : {début} → {résolution}, soit {N} minutes
**Sévérité** : P{1|2|3}
**Impact utilisateur** : {nombre d'utilisateurs touchés, opérations impactées}

## Résumé non-technique
2 phrases compréhensibles par un intérimaire ou un client.

## Timeline
- HH:MM — Détection (alerte Sentry / utilisateur / équipe).
- HH:MM — Déclaration, équipe mobilisée.
- HH:MM — Mitigation appliquée (quelle action a arrêté le saignement).
- HH:MM — Résolution complète.

## Cause racine
Description technique sans nom de personne, sans PII utilisateur.

## Ce qui a bien marché
- {point 1}
- {point 2}

## Ce qu'on améliore
- {action 1 avec ETA}
- {action 2 avec ETA}

## Nos excuses
Excuses sincères, pas corpo.
```

---

## 7. Communication incident — escalade

### 7.1 Grille de décision

| Sévérité | Qui est prévenu | Canal | Délai |
|----------|-----------------|-------|-------|
| P1 prod down | Fondateur + lead tech + MP référent | SMS + appel | ≤ 10 min |
| P2 dégradation majeure | Fondateur + lead tech | Slack + email | ≤ 30 min |
| P3 irritant | Équipe dev | Slack + ticket | Heure ouvrée |

### 7.2 Template SMS astreinte (reçoit le fondateur)

```
[ALERTE P1] {service} down depuis {datestamp}
Runbook : {lien runbook}
Dashboard : {lien grafana}
```

### 7.3 Communication client pendant incident

Pour MovePlanner si l'incident dure > 30 min :

```
Bonjour [contact MP],

Nous avons un incident en cours depuis {datestamp} sur {service}.
Impact : {quoi n'est pas disponible pour vos opérations}.
Workaround : {si applicable} / aucun pour l'instant.
ETA résolution : {estimation} / non encore connue, je reviens vers vous
dans 30 min.

Page de statut : https://status.monagence.ch

Je vous rappelle dès que c'est résolu.

[Fondateur]
```

---

## 8. Retex interne fin de pilote (J+14)

Organiser une séance de 90 min avec :
- Fondateur, lead tech, dev, juriste/DPO si dispo.
- Objectif : compiler les apprentissages.

Structure :

1. **Chiffres** (15 min) — ce qu'on a effectivement livré en 2 semaines.
2. **Ce qui a bien marché** (20 min) — par personne.
3. **Ce qui doit s'améliorer** (25 min) — par personne.
4. **Points ouverts** (10 min) — questions non résolues.
5. **Actions correctives** (15 min) — DRI + ETA.
6. **Décision** (5 min) — Go / No-go pour passer à 10+ intérimaires.

Compte-rendu écrit dans `docs/incidents/pilote-retex-{date}.md` — archive permanente.

---

## 9. Communication post-pilote (scale)

Si go sur la suite (passage à 10+ intérimaires) :

- **Site web** : publier la success story anonymisée (avec accord MP).
- **LinkedIn** : post fondateur "après {N} semaines pilote, voici les chiffres".
- **swissstaffing** : annoncer à l'association ton agence active + ouverture à de nouveaux clients.
- **Presse PME romande** : post Bilan ou PME Magazine si tu cherches de la couverture.

Si no-go : post-mortem interne approfondi, revoir le business case, décider pivot ou arrêt.

---

## 10. Checklist avant J-1

- [ ] Message onboarding envoyé aux 3 intérimaires.
- [ ] Kick-off email envoyé à MovePlanner.
- [ ] Astreinte configurée : numéro d'urgence actif, fondateur + lead tech disponibles.
- [ ] Statuspage prête, tous composants en "operational".
- [ ] Templates SMS/emails vérifiés (pas de typo, pas de variable non remplacée).
- [ ] Runbooks d'incidents à jour.
- [ ] Dashboard Grafana ouvert en permanence côté fondateur.
- [ ] Communication "go-live annoncé" prête (mais pas encore envoyée publiquement — attendre retex J+14).

---

**Fin du document v1.0 — 2026-04-23**
