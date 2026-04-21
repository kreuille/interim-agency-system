# Branch protection `main` — GitHub

> **Statut** : ✅ **Appliqué le 2026-04-21** via GitHub Rulesets (repo public + ruleset id 15364662).
> Cette page garde la configuration de référence pour reproduire sur un autre repo.

## Pré-requis

- Le repo `kreuille/interim-agency-system` existe et `main` est la branche par défaut.
- L'utilisateur qui applique a les droits `Admin` sur le repo.

## Configuration attendue sur `main`

1. **Require a pull request before merging**
   - Required approving reviews : **1**
   - Dismiss stale pull request approvals when new commits are pushed : **oui**
   - Require review from Code Owners : **oui** (voir `.github/CODEOWNERS`)
   - Require approval of the most recent reviewable push : **oui**

2. **Require status checks to pass before merging**
   - Require branches to be up to date before merging : **oui**
   - Status checks requis :
     - `Lint + format`
     - `TypeScript typecheck`
     - `Unit tests`
     - `docker compose smoke`

3. **Require conversation resolution before merging** : oui
4. **Require signed commits** : recommandé (si tous les devs ont une GPG/SSH key configurée) — sinon à différer
5. **Require linear history** : **oui** (cohérent avec `CLAUDE.md §2.5` : rebase avant merge, pas de merge commits)
6. **Do not allow bypassing the above settings** : **oui** (inclut les admins — évite les push `--force` d'urgence)
7. **Restrict who can push to matching branches** : laisser vide (tout le monde via PR)
8. **Allow force pushes** : **non**
9. **Allow deletions** : **non**

## Configuration via CLI `gh`

```bash
gh api --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/kreuille/interim-agency-system/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Lint + format",
      "TypeScript typecheck",
      "Unit tests",
      "docker compose smoke"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
```

## Vérification

```bash
gh api /repos/kreuille/interim-agency-system/branches/main/protection | jq .
```

La réponse doit inclure `enforce_admins.enabled: true`, `required_status_checks.strict: true`, `required_linear_history.enabled: true`.

## À faire également (hors branch protection)

- Activer **Dependabot security updates** : Settings → Code security and analysis → Dependabot → Enable
- Activer **Secret scanning** : Settings → Code security and analysis → Secret scanning → Enable
- Activer **Push protection** : Settings → Code security and analysis → Secret scanning → Push protection → Enable
- Créer les labels : `dependencies`, `docker`, `github-actions`, `compliance-review`, `rules-update`, `blocker`
