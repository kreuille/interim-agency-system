# OPS.api-key-rotation — Rotation clé API MovePlanner (90j)

> **Cadence** : tous les 90 jours
> **Effort** : S (2h)
> **Skills** : `skills/integration/moveplanner-api/SKILL.md`, `skills/dev/security-hardening/SKILL.md`

## Objectif
Rotation proactive des secrets partagés avec MovePlanner : clé API + cert mTLS + secret HMAC webhook.

## Étapes
1. Annoncer le timing à l'équipe MP (contact partenaire) : période de grace 7j.
2. Via interface admin MP ou API : générer nouvelle clé API.
3. Injecter nouvelle clé en Secret Manager (version v{N+1}).
4. Déployer code qui supporte **deux clés simultanément** pendant 7j.
5. Basculer tous les appels sortants sur v{N+1}.
6. Idem pour cert mTLS : générer CSR, soumettre, installer.
7. Idem pour secret HMAC webhooks entrants.
8. Après 7j : retirer l'ancienne clé de Secret Manager, invalider côté MP.
9. Entrée `SESSION-LOG.md` et audit log.

## Tests
- Avant bascule : `curl` avec nouvelle clé → 200.
- Pendant grace : appels avec ancienne clé fonctionnent encore (observabilité).
- Après retrait ancienne : appel avec ancienne clé → 401.

## DoD
- [ ] Nouvelle clé active, ancienne retirée
- [ ] Rotation cert mTLS effectuée
- [ ] Rotation secret HMAC effectuée
- [ ] Audit log + session log

## Références
- `skills/integration/moveplanner-api/SKILL.md §Rotation`
