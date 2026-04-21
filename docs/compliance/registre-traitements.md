# Registre des traitements de données personnelles (nLPD)

> **Responsable du traitement** : Agence d'intérim SA, *à compléter*
> **DPO** : *à compléter*, dpo@monagence.ch
> **Dernière mise à jour** : 2026-04-21
> **Base légale** : nLPD art. 12

Ce registre recense **tous** les traitements de données personnelles effectués par l'agence. Il est **tenu à jour en continu** et **communicable au PFPDT** sur demande.

---

## T-001 — Gestion des intérimaires

- **Finalité** : recrutement, onboarding, affectation, paie, conformité légale (LSE, CCT, assurances sociales).
- **Base légale** : exécution du contrat de travail (CO), obligations légales (LSE, AVS, LPP, LAA), intérêt légitime pour évaluation.
- **Catégories de personnes concernées** : intérimaires candidats, actifs, anciens.
- **Catégories de données** :
  - identité (nom, prénom, date/lieu naissance, nationalité),
  - coordonnées (adresse, email, téléphone),
  - AVS (13 chiffres),
  - IBAN, banque,
  - permis de travail (type, numéro, dates, copie scannée),
  - permis de conduire CH,
  - diplômes et certifications (CACES, SST, VCA…),
  - CV, photo,
  - historique missions, notes d'évaluation,
  - score de fiabilité,
  - consentement cookies / SMS.
- **Catégories sensibles** : données médicales (aptitude SUVA, accidents LAA), copie permis travail (origine). Consentement explicite horodaté.
- **Destinataires** :
  - gestionnaires agence (internes),
  - clients finaux (nom + prénom pour planning + IBAN exclus),
  - MovePlanner (ID pseudonymisé + disponibilités + qualifs via API),
  - caisses sociales (AVS, AC, LAA, LPP) via Swissdec ELM,
  - administrations fiscales (impôt à la source cantonal),
  - comptable externe (Bexio/Abacus partage limité).
- **Durée de conservation** :
  - durée d'emploi + 2 ans (dossier actif),
  - contrats 10 ans (LSE),
  - bulletins 5 ans (CO 958f),
  - candidature non retenue 6 mois max.
- **Transferts hors Suisse** : **aucun**.
- **Mesures de sécurité** :
  - chiffrement CMEK (Infomaniak),
  - MFA pour rôles sensibles,
  - audit log append-only,
  - pseudonymisation dans les logs applicatifs,
  - accès par rôle (RBAC) et par agence (isolation tenant).
- **Sous-traitants** : Infomaniak (hébergement CH, DPA signé), Swisscom (SMS + signature, DPA signé), Bexio / Abacus (export compta, DPA signé).

---

## T-002 — Gestion des clients (B2B)

- **Finalité** : relation commerciale, facturation, reporting.
- **Base légale** : exécution du contrat commercial, intérêt légitime prospection (opt-in).
- **Catégories de personnes** : contacts clients (responsables RH, chefs d'équipe, comptables).
- **Catégories de données** : nom, prénom, rôle, email pro, tél pro.
- **Destinataires** : interne + backup comptable.
- **Conservation** : durée de la relation + 5 ans (CO).
- **Transferts hors Suisse** : aucun.
- **Mesures** : idem T-001.

---

## T-003 — Cycle mission / timesheets

- **Finalité** : suivi exécution mission, validation heures, facturation.
- **Base légale** : exécution du contrat.
- **Catégories de personnes** : intérimaires placés + chef d'équipe client + client.
- **Données** : horaires prévus/réels, pauses, majorations, localisation (adresse mission), signatures.
- **Destinataires** : client (heures pour signature), agence (paie, facturation).
- **Conservation** : 10 ans avec le contrat de mission.
- **Transferts hors Suisse** : aucun.

---

## T-004 — Paie hebdomadaire et social

- **Finalité** : calcul salaire, déductions sociales, annonce ELM, virement bancaire.
- **Base légale** : obligations légales (AVS, LAA, LPP, IS).
- **Catégories de personnes** : intérimaires.
- **Données** : brut, déductions, net, IBAN, barème cantonal IS, canton domicile, statut marital (pour IS).
- **Destinataires** : caisses AVS/AC/LAA/LPP (Swissdec), administrations fiscales, banque agence, intérimaire.
- **Conservation** : 5 ans (bulletin), 10 ans (registre de paie).
- **Transferts hors Suisse** : aucun.

---

## T-005 — Logs applicatifs et monitoring

- **Finalité** : sécurité, debugging, audit.
- **Base légale** : intérêt légitime (sécurité informatique).
- **Catégories** : utilisateurs agence, intérimaires (interactions portail).
- **Données** : adresses IP, user-agent, actions (pseudonymisées), timestamps.
- **Destinataires** : lead tech, SRE.
- **Conservation** : 12 mois.
- **Transferts hors Suisse** : Sentry EU (DPA signé, clauses types).
- **Mesures** : pseudonymisation staffId (hash), pas de nom en clair.

---

## T-006 — Signature électronique des contrats

- **Finalité** : conclusion des contrats de mission intérimaires + clients.
- **Base légale** : exécution du contrat.
- **Catégories** : intérimaires, gestionnaires agence, contacts clients.
- **Données** : nom, prénom, numéro mobile (OTP), email, signature (certificat ZertES).
- **Destinataires** : Swisscom Trust Services (sous-traitant CH).
- **Conservation** : 10 ans (LSE / CO).
- **Transferts hors Suisse** : aucun.

---

## T-007 — Communications SMS et email aux intérimaires

- **Finalité** : notification de proposition, OTP, alertes document, info paie.
- **Base légale** : exécution du contrat + consentement (opt-in SMS commerciaux).
- **Données** : numéro mobile, email, contenu message.
- **Destinataires** : Swisscom Enterprise (sous-traitant CH) ou Twilio fallback (UE, DPA).
- **Conservation** : logs 12 mois.
- **Transferts hors Suisse** : éventuel Twilio Ireland (si fallback), clauses types.

---

## Changements de traitement

Toute modification matérielle d'un traitement (nouvelle donnée, nouveau destinataire, nouveau sous-traitant, nouveau transfert) nécessite :

1. Mise à jour de ce registre.
2. Validation DPO.
3. Information des personnes concernées si impact notable (ex. nouveau destinataire).
4. Re-consentement si nouvelle base légale = consentement.

---

## Droits des personnes

Les intérimaires et contacts clients peuvent exercer leurs droits (accès, rectification, effacement dans limites légales, portabilité, opposition) par email à **dpo@monagence.ch**. Délai de réponse : ≤ 30 jours.

---

**Fin du registre v1.0** — maintenu à jour en continu.
