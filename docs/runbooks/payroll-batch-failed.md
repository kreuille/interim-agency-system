# Runbook — Batch paie hebdo échoué

> **Sévérité** : 🔴 critical (les workers attendent leur paie — délai légal CO art. 323)
> **Owner** : payroll_officer + dev domain payroll
> **Cible résolution** : < 1 h avant cutoff banque (typiquement vendredi 14h00)
> **Dernière maj** : 2026-04-22

## 1. Déclencheur

- Job BullMQ `payroll-weekly-batch` en `failed` (Sentry alert)
- Métrique `payroll_batch_workers_processed_total` < attendu
- Ticket payroll_officer : "Le NET d'un worker semble faux"
- Échec validation pain.001 XSD (DETTE-077) avant envoi banque
- `outbound_idempotency_keys` montre des doublons sur `payroll-NNNN`

## 2. Diagnostic — 5 minutes

```bash
# 1. Voir le job échoué
kubectl exec -n prod deploy/worker -- node -e "
  const { Queue } = require('bullmq');
  const q = new Queue('payroll-weekly-batch', { connection: { host: 'prod-redis' } });
  q.getFailed(0, 5).then(jobs => console.log(jobs.map(j => ({id: j.id, err: j.failedReason}))));
"

# 2. Compter workers traités vs attendus pour la semaine ISO N-1
psql -c "
  SELECT week_iso,
         count(*) FILTER (WHERE state = 'computed') AS computed,
         count(*) FILTER (WHERE state = 'failed') AS failed,
         count(*) FILTER (WHERE state = 'pending') AS pending
  FROM payroll_runs
  WHERE week_iso = '2026-W17'
  GROUP BY week_iso;
"

# 3. Erreurs domain (PayrollEngine throws)
kubectl logs -n prod deploy/worker --tail=2000 | grep -E "WeeklyLimitExceeded|NoSignedTimesheets|MismatchedWeek|InvalidPayrollInput" | head

# 4. Vérifier qu'un fichier pain.001 n'a PAS été envoyé (sinon : crisis paiement double potentiel)
psql -c "SELECT id, status, sent_at FROM pain001_batches WHERE week_iso = '2026-W17' ORDER BY created_at DESC"
```

## 3. Action immédiate

### 3.a Une partie des workers en échec (anomalie domain)

Pour chaque worker en échec :

1. **Identifier la cause** :
   ```bash
   psql -c "
     SELECT worker_id, last_error
     FROM payroll_runs
     WHERE week_iso = '2026-W17' AND state = 'failed';
   "
   ```
2. **Cas typiques** :
   - `WeeklyLimitExceededInPayroll` : worker a > 50h LTr → contacter dispatcher pour redécouper missions ou marquer 1 timesheet `disputed` puis rejouer
   - `NoSignedTimesheets` : aucun timesheet signed/tacit → vérifier que le dispatcher a bien signé. Si oui, c'est un bug de filtrage : ouvrir issue.
   - `MismatchedWeek` : timesheet en mauvaise semaine ISO → corriger côté MP via dispute + re-import
   - `InvalidPayrollInput` (taux client manquant) : config rate card client à compléter
3. **Rejouer worker individuel** après correction :
   ```bash
   kubectl exec -n prod deploy/worker -- node -e "
     const { computeWorkerPayroll } = require('@interim/application');
     // ... script ad hoc, payroll_officer + dev pair
   "
   ```

### 3.b Job BullMQ entier en échec (infra)

1. Vérifier Redis up : `redis-cli -h prod-redis ping` → PONG
2. Vérifier DB up : `psql -c "SELECT 1"`
3. Si infra OK → relancer le job complet via API admin :
   ```bash
   curl -X POST -H "Authorization: Bearer dev:agency_admin" \
     http://prod-api/api/v1/admin/payroll/run-week \
     -d '{"isoWeek": "2026-W17"}'
   ```
4. Idempotent : ne va pas générer 2 bulletins pour les workers déjà `computed`.

### 3.c Pain.001 généré mais XSD invalide

1. **NE PAS envoyer à la banque**. Vérifier statut :
   ```bash
   psql -c "SELECT id, status, validation_error FROM pain001_batches WHERE week_iso = '2026-W17'"
   ```
2. Si status = `invalid` → analyser `validation_error` (cf. SIX guideline V1.13.5).
3. Cas typiques :
   - IBAN worker mal formaté → corriger profil worker, regénérer
   - `CtrlSum` mismatch → bug arithmétique : ouvrir issue critique
   - Caractères non-UTF8 dans `Nm` → sanitize côté builder
4. Une fois corrigé → regénérer + valider XSD → envoyer batch banque.

## 4. Vérifications avant envoi banque (CHECKLIST OBLIGATOIRE)

Avant tout `curl` vers le portail bancaire (PostFinance/UBS) :

- [ ] Tous les workers attendus présents (count = listing payroll_officer)
- [ ] CtrlSum total cohérent avec rapport agence interne
- [ ] Tous IBAN workers vérifiés (mod-97 OK)
- [ ] MsgId unique (pas réutilisé une semaine précédente)
- [ ] Validation XSD libxmljs2 passée
- [ ] **Double-vérification visuelle 4-eyes** : un autre payroll_officer relit
- [ ] Backup de la DB pré-envoi : `kubectl exec -n prod deploy/api -- pg_dump ... > /backups/pre-payroll-W17.sql`

## 5. Action légale si délai dépassé

**Si la paie ne peut pas partir dans les 24h après cutoff** :
- Code des obligations art. 323 : salaire mensuel/hebdo dû à terme
- Communication immédiate aux workers (SMS + email portail) avec date corrigée
- Notification formelle SECO si retard > 7 jours (LSE art. 14)
- Avocat du travail à mobiliser si conflit prévisible

## 6. Post-mortem

Tout échec batch payroll → post-mortem obligatoire dans `docs/runbooks/postmortems/YYYY-MM-DD-payroll-batch.md` :
- Workers impactés (anonymisés via staffId hash)
- Délai retard
- Root cause technique
- Communication faite aux workers
- Plan correctif (test scenario à ajouter, alerte précoce, etc.)

## 7. Références

- `packages/domain/src/payroll/payroll-engine.ts` (`PayrollEngine.computeWeek`)
- `packages/domain/src/payroll/payslip-engine.ts` (`PayslipEngine.compute`)
- `packages/domain/src/payments/pain001-builder.ts` (génération XML)
- `apps/worker/src/payroll-batch.worker.ts` (DETTE — pas encore créé)
- `docs/runbooks/payment-file-rejected.md` (si banque rejette)
