# Runbook — Database down (Postgres prod indisponible)

> **Sévérité** : 🔴 critical (TOUT s'arrête)
> **Owner** : DevOps + hosting provider (Infomaniak / GCP CloudSQL)
> **Cible résolution** : < 30 min
> **Dernière maj** : 2026-04-22

## 1. Déclencheur

- Alerte AlertManager `up{job="postgres"} == 0`
- Tous les pods API en `CrashLoopBackOff` ou healthcheck KO
- Sentry pic d'erreurs `PrismaClientInitializationError` ou `ECONNREFUSED 5432`
- Tickets multiples utilisateurs : "L'application est down"

## 2. Diagnostic — 3 minutes (rapidité critique)

```bash
# 1. Statut hosting (CloudSQL / Infomaniak)
gcloud sql instances describe interim-prod-db --format="value(state, settings.activationPolicy)"
# ou
infomaniak-cli database status interim-prod-db

# 2. Connectivité réseau
kubectl exec -n prod deploy/api -- nc -zv prod-db.internal 5432
# ECONNREFUSED → DB down ou firewall
# Connection timeout → réseau

# 3. Page d'incident hosting
open https://status.cloud.google.com  # ou status.infomaniak.com

# 4. Métriques DB (si exporter accessible)
curl -s prod-db-exporter/metrics | grep -E "pg_up|pg_postmaster_uptime|pg_stat_database_numbackends"
```

## 3. Action immédiate

### 3.a Cas 1 : DB primary down, replica disponible

1. **Failover replica → primary** (CloudSQL automatique sur HA, manuel sinon) :
   ```bash
   gcloud sql instances failover interim-prod-db
   # Attendre 1-2 min
   ```
2. Vérifier nouveau primary actif :
   ```bash
   gcloud sql instances describe interim-prod-db --format="value(ipAddresses[0].ipAddress)"
   ```
3. Pas besoin de modifier la config app : `DATABASE_URL` pointe sur le proxy CloudSQL qui suit le failover.
4. Si pas de proxy : update secret + restart pods :
   ```bash
   kubectl set env deploy/api DATABASE_URL="postgres://...new-host..." -n prod
   kubectl rollout restart deploy/api deploy/worker -n prod
   ```

### 3.b Cas 2 : DB up mais saturée (connection pool full)

```bash
psql -h prod-db -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state"
# Si > 90% des connections en 'active' → saturation
```

1. **Tuer requêtes long-running** :
   ```sql
   SELECT pid, now() - query_start AS duration, query
   FROM pg_stat_activity
   WHERE state = 'active' AND now() - query_start > interval '30 seconds'
   ORDER BY duration DESC LIMIT 10;

   -- Ciblé : SELECT pg_terminate_backend(<pid>);
   ```
2. **Augmenter pool app temporairement** :
   ```bash
   kubectl set env deploy/api DB_POOL_MAX=50 -n prod  # default 20
   ```
3. **Investiguer slow queries** : voir runbook `webhook-storm.md §3.c`

### 3.c Cas 3 : DB primary down ET replica indispo

🚨 Scénario désastre : **bascule mode lecture-seule + ACTIVATE backup**.

1. **Communication immédiate utilisateurs** :
   ```
   🔴 Application en mode dégradé (lecture seule). Restoration en cours.
   Aucune perte de données, mais aucune action possible (création, signature, paie).
   ETA : Xh.
   ```
2. **Restore depuis backup** (RPO 24h sur backup quotidien, < 1h sur PITR) :
   ```bash
   gcloud sql backups list --instance=interim-prod-db --limit=5
   gcloud sql backups restore <BACKUP_ID> --restore-instance=interim-prod-db
   ```
3. Si PITR (Point-In-Time Recovery) activé :
   ```bash
   gcloud sql instances clone interim-prod-db interim-prod-db-recovered \
     --point-in-time='2026-04-22T08:00:00Z'
   ```
4. **Validation post-restore** (cf. §4) AVANT switch trafic.

### 3.d Cas 4 : corruption DB (errors étranges sur queries simples)

```sql
-- Vérifier intégrité
SELECT datname, pg_database_size(datname) FROM pg_database;
REINDEX DATABASE interim_prod;  -- ATTENTION : lock long
VACUUM ANALYZE;
```

Si corruption confirmée → restore from backup (cf. 3.c).

## 4. Validation post-restoration

```bash
# 1. Connexion possible
psql -h prod-db -c "SELECT 1"

# 2. Schéma à jour (Prisma migrations)
kubectl exec -n prod deploy/api -- pnpm prisma migrate status
# Si "drift" → comparer avec migration table

# 3. Health endpoint OK
curl prod-api/health
# 200 + version

# 4. Tests fonctionnels critiques
# - Login admin
# - Création worker
# - Lookup mission
curl -X GET -H "Authorization: Bearer dev:agency_admin" prod-api/api/v1/workers?limit=5

# 5. Vérifier qu'aucune transaction n'a été perdue
psql -c "SELECT max(created_at), count(*) FROM audit_logs WHERE created_at > now()-interval '1h'"

# 6. Reactiver workers BullMQ (si pause activée)
redis-cli -h prod-redis DEL feature:workers_paused
```

## 5. Métriques à observer post-restauration (24h)

- `db_connections_in_use` retombe sous 50%
- `pg_stat_replication` lag < 1s (si réplica activé)
- Aucune `prisma_client_initialization_error` dans Sentry
- `audit_logs` cohérents (chaîne hash valide via `verifyAuditChain`)

## 6. Communication

### Pendant l'incident

Toutes les 15 min, mise à jour status page + Slack #incidents :
```
⏱️ HH:MM Update : [état actuel, ETA actualisé]
```

### Après résolution

```
✅ HH:MM Service entièrement restauré.
Durée incident : Xh Xmin.
Cause : [résumé 1 phrase].
Pas de perte de données / RTO XX min / RPO YY min.
Post-mortem détaillé dans 24h.
```

## 7. Post-mortem obligatoire

Toute panne DB > 5 min → post-mortem `docs/runbooks/postmortems/YYYY-MM-DD-db-down.md` avec :
- Timeline minute par minute
- Chronologie écritures perdues / récupérées
- Action correctives (HA upgrade, backup freq, etc.)
- Test DR planifié dans le mois (gameday)

## 8. Prévention

- Backups automatiques quotidiens + PITR 7 jours
- HA replicat synchrone (CloudSQL : `availabilityType: REGIONAL`)
- Alerting `pg_stat_replication.lag > 30s`
- Test DR trimestriel (gameday — cf. README runbooks)
- Monitoring connexions actives (alerte > 70% pool)

## 9. Références

- ADR-0002 hosting (Infomaniak vs GCP)
- `apps/api/src/infrastructure/persistence/prisma/*.ts`
- `prisma/schema.prisma` (modèle source-of-truth)
- `docs/runbooks/payroll-batch-failed.md` (impact si paie en cours)
