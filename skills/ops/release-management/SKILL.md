# Skill — Release management

## Rôle
Release manager. Cadre les mises en prod, gère les runbooks, les rollbacks, les incidents.

## Quand l'utiliser
Déploiement, incident, astreinte, gameday, post-mortem.

## Principes
- **Releases fréquentes et petites**. Idéal : 1–3 mises en prod / semaine, chacune < 200 lignes diff.
- **Déploiement découplé du release** (feature flags) : on deploy le code, on active la feature quand on veut.
- **Rollback rapide** : image précédente redéployable en 1 commande, < 5 min.
- **Postmortem sans blâme** systématique pour tout incident P1/P2.

## Cycle de release

```
merge PR → main
   ↓ (CI → image Docker taggée :sha-{hash})
deploy staging (auto)
   ↓ (tests E2E smoke automatisés)
tag release/vX.Y.Z (manuel)
   ↓ (CI release → image taggée :vX.Y.Z)
deploy prod (manuel approval)
   ↓
monitoring 30 min (prometheus alerts actives)
   ↓
release OK
```

## Versioning
- **SemVer** strict : X.Y.Z.
- `X` : breaking change contrat externe (API publique). Rare.
- `Y` : feature visible utilisateur/client.
- `Z` : bugfix, amélioration interne.

## Runbooks à avoir avant go-live (A.6)

| Runbook | Déclencheur | Actions résumées |
|---------|-------------|------------------|
| `mp-unreachable.md` | MP API 5xx > 10 min | Circuit breaker ouvert, fallback jobs en retry, alerte fondateur |
| `webhook-storm.md` | > 100 webhooks/min inattendus | Vérifier HMAC valide, scaler workers, contacter MP |
| `payroll-batch-failed.md` | Vendredi 18h, paie KO | Diagnostic, relance manuelle, informer intérimaires du retard, SLA 24h |
| `secret-leaked.md` | Secret exposé | Rotation immédiate, revoke, audit logs, communication incident |
| `database-down.md` | Postgres indispo | Bascule read replica, ops Infomaniak, RPO/RTO |
| `payment-file-rejected.md` | pain.001 rejeté banque | Diagnostic XSD, correction, re-soumission, relance virement |

## Gestion d'incident — phase réactive

1. **Détecter** : alerte Sentry/Grafana ou signal utilisateur.
2. **Déclarer** : créer incident dans canal dédié (Slack `#incidents` ou équivalent). Timestamp, sévérité (P1 prod impact majeur, P2 dégradation partielle, P3 irritant).
3. **Stabiliser** : stop the bleeding. Feature flag off, rollback, scale, bascule. Pas de fix long, juste restaurer le service.
4. **Communiquer** : status page interne + email si externe. Mises à jour /15min min.
5. **Résoudre** : fix réel.
6. **Postmortem** : dans les 5 jours ouvrés. Template `docs/incidents/YYYY-MM-DD-slug.md`.

## Postmortem template
```markdown
# Incident YYYY-MM-DD — {titre}

## Résumé
2 phrases.

## Timeline
- HH:MM détection
- HH:MM déclaration
- HH:MM diagnostic
- HH:MM mitigation
- HH:MM résolution

## Impact
- Utilisateurs impactés : N
- Durée : HHm
- Gravité : P1/P2/P3
- Coût estimé : CHF X

## Cause racine
{description technique}

## Ce qui a bien marché
- ...

## Ce qui doit s'améliorer
- ...

## Actions correctives (DRI + ETA)
- [ ] Action 1 — DRI — ETA
- [ ] Action 2 — DRI — ETA
```

## Pièges courants
- Postmortem qui cherche un coupable → équipe sur la défensive, on n'apprend rien.
- Runbooks théoriques jamais joués → inutiles le jour J.
- Rollback en 30 min parce que la procédure est cassée → doit être testée en gameday.
- Release sans feature flag sur un gros changement → rollback = casse data.

## Références
- Google SRE book : https://sre.google/sre-book/
- `docs/03-plan-de-dev.md §3 Sprint A.6`
