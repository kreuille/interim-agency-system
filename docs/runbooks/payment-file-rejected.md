# Runbook — pain.001 rejeté par la banque

> **Sévérité** : 🟠 high (paie workers retardée)
> **Owner** : payroll_officer + DevOps
> **Cible résolution** : < 4 h (avant cutoff banque suivant)
> **Dernière maj** : 2026-04-22

## 1. Déclencheur

- Email banque (PostFinance/UBS) : "pain.001 rejected" + reason code
- Réception fichier `pain.002` (status report) avec `OrgnlMsgId` matching et `GrpSts != ACCP`
- Aucun `camt.053` reçu 48h après envoi (pas d'acquittement)
- Worker reportant : "Je n'ai pas reçu mon salaire"

## 2. Diagnostic — 10 minutes

### 2.1 Récupérer le pain.002 (status report)

```bash
# Si EBICS auto-fetch (DETTE-079 : worker pas encore en prod)
# Sinon : portail banque manuel → télécharger pain.002

# Identifier raison du rejet : code ISO 20022 standard
# Ex. AC01, AC04, AM05, BE05, MS03... (cf. SIX Reject Code List)
xmlstarlet sel -t -v "//ns:StsRsnInf/ns:Rsn/ns:Cd" pain002.xml
```

### 2.2 Identifier le batch concerné

```bash
# MsgId du pain.001 envoyé
psql -c "
  SELECT id, message_id, week_iso, total_chf, sent_at, status
  FROM pain001_batches
  WHERE message_id = '<MSG_ID_FROM_PAIN002>';
"
```

## 3. Action selon code de rejet

### Code `AC01` — Format IBAN invalide

1. Identifier la(les) ligne(s) `CdtTrfTxInf` rejetée(s) dans pain.002
2. Mapper aux workers via `endToEndId` (format `SAL-{workerId}-{weekIso}`)
3. Corriger IBAN dans profil worker :
   ```bash
   psql -c "UPDATE workers SET iban='CH...' WHERE id='<workerId>'"
   ```
4. **Regénérer pain.001 avec nouveau MsgId** (CRITIQUE : MsgId doit changer pour éviter doublon banque)
5. Renvoyer batch

### Code `AC04` — Compte créditeur clos

1. Worker doit fournir nouveau IBAN (contact RH/dispatcher)
2. Mettre à jour profil
3. Regénérer pain.001 partiel (uniquement workers concernés) avec nouveau MsgId

### Code `AM05` — Duplicate transmission

🚨 **DANGER** : la banque considère qu'on a déjà envoyé ce MsgId.

1. **Vérifier qu'on n'a pas déjà payé** :
   ```bash
   # Logs envoi
   grep "MSG_ID_X" /var/log/api/*.log

   # Compte bancaire (manuel via portail)
   # Si crédit déjà débité → STOPPER toute action, contacter banque
   ```
2. Si vraiment doublon (artefact infra) → ne PAS regénérer, tracer dans audit_logs
3. Si la banque a réellement traité 2x → procédure de remboursement (contact banque hotline)

### Code `BE05` — Identification emetteur invalide

- Cert EBICS expiré ou révoqué
- Suivre runbook `cert-rotation.md` (DETTE)
- Renouveler cert avec banque

### Code `MS03` — Taux de change non supporté

- Pas applicable en CHF, mais si on traite EUR (workers UE) :
  - Vérifier que `Ccy="CHF"` dans `<InstdAmt>` (cf. `formatChf` dans builder)
  - Convertir en amont si paiement effectif en EUR

### Code générique `RUTA` — Reason Untranslated

- Contact banque hotline directement
- Demander explication détaillée
- Documenter dans post-mortem

## 4. Procédure de re-envoi sécurisée

```bash
# 1. Marquer ancien batch comme rejeté
psql -c "UPDATE pain001_batches SET status='rejected', rejection_reason='AC01' WHERE id=<old_id>"

# 2. Régénérer (DETTE-085 : worker BullMQ — pour MVP, manuel)
curl -X POST -H "Authorization: Bearer dev:payroll_officer" \
  http://prod-api/api/v1/admin/payroll/regenerate-pain001 \
  -d '{"weekIso": "2026-W17", "workerIdsToFix": ["w-xx", "w-yy"]}'

# 3. Validation XSD locale (DETTE-077)
xmlstarlet val --xsd pain.001.001.09.xsd new-pain001.xml

# 4. Vérification 4-eyes payroll_officer
# (relire visuellement les corrections)

# 5. Envoi banque
# (manuel via portail OU via worker BullMQ DETTE-085)
```

## 5. Communication workers impactés

### Si délai retard < 24h

Pas de communication individuelle nécessaire (paie tombe le lendemain au lieu du jour J). Mention dans newsletter mensuelle suffit.

### Si délai retard ≥ 24h

```
Subject: [Acme Intérim] Léger décalage de votre paie semaine W17

Bonjour [Prénom],

Votre paie de la semaine 2026-W17 a connu un léger décalage technique.
Elle sera créditée sur votre compte d'ici le [DATE+2j].

Aucune action n'est requise de votre part.

Pour toute question : contact@acme-interim.ch ou +41 22 XXX XX XX.

Avec nos excuses,
L'équipe Acme Intérim
```

### Si délai > 7 jours

⚠️ Notification SECO (LSE art. 14) + avocat du travail mobilisé.

## 6. Vérification post-envoi corrigé

```bash
# 1. Status pain001_batches
psql -c "SELECT id, status, sent_at FROM pain001_batches WHERE week_iso='2026-W17' ORDER BY created_at"
# Doit montrer : <old_id>='rejected', <new_id>='sent'

# 2. Recevoir pain.002 d'acceptation (sous 24-48h)
# Status attendu : <GrpSts>ACCP</GrpSts>

# 3. Recevoir camt.053 (encaissements vu côté banque)
# Sous 2-3 jours ouvrés

# 4. Confirmer crédit workers (échantillon manuel ou via support workers)
```

## 7. Post-mortem si délai > 24h

`docs/runbooks/postmortems/YYYY-MM-DD-pain001-rejected-<code>.md` :
- Code rejet + interprétation
- Workers concernés (count)
- Délai retard
- Actions correctives :
  - [ ] Validation IBAN renforcée à la création worker
  - [ ] XSD validation pre-envoi systématique (DETTE-077)
  - [ ] Process review IBAN trimestriel

## 8. Prévention

- Pre-envoi : validation IBAN mod-97 (déjà active via `Iban.isValid`)
- Pre-envoi : XSD validation (DETTE-077)
- Pre-envoi : MsgId unique vérifié (no replay)
- Post-envoi : monitoring réception pain.002 sous 48h (alerte si manque)
- Test trimestriel : envoyer pain.001 sandbox avec IBAN volontairement invalide → vérifier que le code remonte dans nos logs

## 9. Références

- `packages/domain/src/payments/pain001-builder.ts` (génération XML CH)
- `packages/domain/src/payments/pain001-types.ts` (types ISO 20022)
- SIX Implementation Guidelines V1.13.5 §Reject Code List
- ISO 20022 External Code List (https://www.iso20022.org/external_code_list.page)
- `docs/runbooks/payroll-batch-failed.md` (en amont du pain.001)
