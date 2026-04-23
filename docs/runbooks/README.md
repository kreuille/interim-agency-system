# Runbooks d'incidents — Index

> **Public** : équipe d'astreinte (dev + ops + agency_admin)
> **Convention** : chaque runbook démarre par un encart **Déclencheur**, puis liste des **Étapes** copy-paste-ready, puis **Escalade** + **Post-mortem**.
> **Mise à jour** : à chaque incident réel, mettre à jour le runbook concerné dans la même PR que la résolution. Préfixer `[postmortem-YYYY-MM-DD]` les nouveaux paragraphes.

## Catalogue

| Runbook | Sévérité initiale | Temps de résolution cible | Dashboard Grafana lié |
|---------|-------------------|---------------------------|----------------------|
| [mp-unreachable.md](mp-unreachable.md) | 🟠 high | < 30 min | [`mp-health`](../../ops/grafana/dashboards/mp-health.json) |
| [webhook-storm.md](webhook-storm.md) | 🔴 critical | < 15 min | [`mp-health`](../../ops/grafana/dashboards/mp-health.json) |
| [payroll-batch-failed.md](payroll-batch-failed.md) | 🔴 critical | < 1 h (avant exécution paie) | [`payroll-batch`](../../ops/grafana/dashboards/payroll-batch.json) |
| [secret-leaked.md](secret-leaked.md) | 🔴 critical | rotation immédiate | — |
| [database-down.md](database-down.md) | 🔴 critical | < 30 min | [`api-health`](../../ops/grafana/dashboards/api-health.json) |
| [payment-file-rejected.md](payment-file-rejected.md) | 🟠 high | < 4 h (avant prochain batch banque) | — |
| [disaster-recovery.md](disaster-recovery.md) | 🔴 critical | RPO 15 min, RTO 4h | [`backup-dr`](../../ops/grafana/dashboards/backup-dr.json) |

## Conventions générales

### Niveaux de sévérité

- 🔴 **critical** : impact business immédiat, paie/paiements/conformité affectés. **Astreinte 24/7**, contact direction obligatoire.
- 🟠 **high** : dégradation service, dispatcher / worker affecté mais pas paie. **Astreinte heures ouvrées**.
- 🟡 **medium** : impact UX, pas de blocage métier critique.

### Contacts d'astreinte

Voir `docs/07-rôles.md §Astreinte`. Toujours :
1. Slack #incidents (notification rapide équipe)
2. Téléphone du responsable du composant (cf. tableau ci-dessous)
3. Si non-réponse > 10 min : escalade direction

| Composant | Responsable principal | Backup |
|-----------|----------------------|--------|
| MovePlanner intégration | Dev backend lead | Architecte |
| Webhooks inbound | Dev backend | DevOps |
| Paie & social insurance | Payroll officer + Dev domain | Direction |
| GED / signatures | Dev backend + DPO | Juridique |
| Database / infra | DevOps | Hosting provider (Infomaniak/Swisscom) |
| Sécurité (secrets, fuites) | DPO + DevOps + direction | Pentest contractor |

### Outils requis

- `kubectl` / `gcloud` / `infomaniak` CLI selon hosting (cf. `docs/dev-setup.md`)
- Accès Sentry, Prometheus, Grafana, AlertManager (read-only suffit pour la plupart des runbooks)
- Accès secret manager (rotation : write requis, mais demander au DPO+1 si possible)
- Accès DB read-only via bastion (`bastion-prod.interim.ch`) — voir `docs/dev-setup.md`

### Structure d'un runbook

```markdown
# [Titre du runbook]
> **Sévérité** : 🔴/🟠/🟡
> **Cible résolution** : Xmin/h

## Déclencheur
- Alerte AlertManager `xxx`
- Symptôme observable
- Métrique seuil

## Diagnostic rapide (≤ 5 min)
[Commandes copy-paste pour confirmer le problème]

## Étapes de résolution
[Numérotées, copy-paste-ready]

## Vérification post-résolution
[Comment confirmer que l'incident est clos]

## Escalade
[Quand et qui contacter si étapes ne suffisent pas]

## Post-mortem
[Modèle court : timeline / root cause / actions]
```

## Gameday

Tester 2 runbooks en simulation par trimestre :
- **Q1** : `mp-unreachable.md` (kill mock-mp) + `database-down.md` (read-replica failover)
- **Q2** : `secret-leaked.md` (rotation simulée) + `webhook-storm.md` (locust scenario)
- **Q3** : `payroll-batch-failed.md` (corruption fixture) + `payment-file-rejected.md` (pain.001 invalide)

Compte-rendu obligatoire dans `docs/runbooks/gamedays/YYYY-QX.md` après chaque exercice.
