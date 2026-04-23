#!/usr/bin/env bash
# shellcheck shell=bash
#
# _lib.sh — helpers communs aux scripts ops/backup/*.sh.
#
# **NE PAS exécuter directement.** Sourcer depuis pg_dump.sh, pg_restore.sh,
# test-roundtrip.sh, wal-archive.sh.
#
# Fournit :
#   - `log_msg LEVEL MSG [CTX_JSON]` : log human-readable en dev,
#     JSON Lines en CI (env `CI=true`), pour parsing Promtail / GitHub
#     Actions structured logs.
#   - Codes d'exit normalisés (cf. Conventions DETTE-037 § enhancements) :
#       0 = succès
#       1 = dump fail (pg_dump command failed)
#       2 = age fail (encrypt OU decrypt failed)
#       3 = sha256 fail (gen ou verify mismatch)
#       4 = restore fail (pg_restore command failed) OU upload fail (réseau bucket)
#       5 = rowcount mismatch (test E2E)
#       6 = RTO budget dépassé (test E2E)
#
# Utilisation :
#   #!/usr/bin/env bash
#   set -euo pipefail
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   # shellcheck source=ops/backup/_lib.sh
#   source "${SCRIPT_DIR}/_lib.sh"
#   log_msg info "starting backup" '{"db":"interim_prod"}'

# Détecte le mode CI (GitHub Actions, GitLab CI, etc.) — convention env CI=true
# adoptée par la majorité des plateformes (cf. GitHub docs § default env vars).
is_ci_mode() {
  [[ "${CI:-false}" == "true" ]]
}

# Échappe une string pour JSON (basique : guillemets, backslash, newlines).
# N'utilise pas jq pour rester sans dépendance externe (les scripts tournent
# sur des images minimales en prod).
_json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

# log_msg LEVEL MSG [CTX_JSON]
#
# LEVEL : info|warn|error
# MSG   : message texte (sans guillemets nécessaires)
# CTX   : objet JSON (facultatif, brut, ex: '{"db":"x","sizeBytes":42}')
#
# En mode CI : émet une ligne JSON Lines sur stdout + un texte
# `::group::` GitHub Actions pour pliage. En dev : préfixe `[level]`.
log_msg() {
  local level="${1:-info}"
  local msg="${2:-}"
  local ctx="${3:-}"
  local script_name
  script_name="$(basename "${0:-unknown}")"

  if is_ci_mode; then
    local ts
    ts="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"
    local escaped_msg
    escaped_msg="$(_json_escape "$msg")"
    if [[ -n "$ctx" ]]; then
      printf '{"ts":"%s","level":"%s","script":"%s","msg":"%s","ctx":%s}\n' \
        "$ts" "$level" "$script_name" "$escaped_msg" "$ctx"
    else
      printf '{"ts":"%s","level":"%s","script":"%s","msg":"%s"}\n' \
        "$ts" "$level" "$script_name" "$escaped_msg"
    fi
  else
    # Mode dev : human-readable, préfixe basé sur le script + level.
    local prefix
    prefix="[${script_name%.sh}]"
    case "$level" in
      error) printf '%s ERROR: %s\n' "$prefix" "$msg" >&2 ;;
      warn)  printf '%s WARN: %s\n' "$prefix" "$msg" >&2 ;;
      *)     printf '%s %s\n' "$prefix" "$msg" ;;
    esac
  fi
}

# Codes d'exit normalisés — sourcés comme constantes pour lisibilité.
# Voir aussi : `docs/runbooks/disaster-recovery.md` § Erreurs courantes.
# shellcheck disable=SC2034  # Constantes consommées par les scripts qui sourcent _lib.sh
readonly EXIT_OK=0
# shellcheck disable=SC2034
readonly EXIT_DUMP_FAIL=1
# shellcheck disable=SC2034
readonly EXIT_AGE_FAIL=2
# shellcheck disable=SC2034
readonly EXIT_SHA256_FAIL=3
# shellcheck disable=SC2034
readonly EXIT_RESTORE_FAIL=4 # Aussi utilisé pour upload bucket (overlap acceptable)
# shellcheck disable=SC2034
readonly EXIT_ROWCOUNT_MISMATCH=5
# shellcheck disable=SC2034
readonly EXIT_RTO_EXCEEDED=6
