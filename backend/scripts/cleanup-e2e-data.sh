#!/usr/bin/env bash
# Reviews, and only with --execute removes, leftover E2E test data from the DEVELOPMENT database (compose service
# `postgres`, database `inventory`). Default is a read-only dry run that prints what would be deleted.
#
#   ./scripts/cleanup-e2e-data.sh              dry run (read-only transaction, changes nothing)
#   ./scripts/cleanup-e2e-data.sh --execute    back up, ask for confirmation, then delete
#
# Matching rules and the order of deletion are in cleanup-e2e-data.sql. Never run this against a shared or deployed
# database: it only talks to the local Compose container, and --execute refuses to run while the backend is up.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() {
  echo "Error: $*" >&2
  exit 1
}

execute=false
case "${1:-}" in
  "") ;;
  --execute) execute=true ;;
  *) fail "usage: $0 [--execute]" ;;
esac

command -v docker >/dev/null 2>&1 || fail "docker is not installed."
[[ -f .env ]] || fail "backend/.env not found."
set -a
# shellcheck disable=SC1091
source .env
set +a
: "${DB_USERNAME:?DB_USERNAME must be set in .env}"

db=inventory
psql_run() {
  docker compose exec -T postgres psql -U "$DB_USERNAME" -d "$db" -v ON_ERROR_STOP=1 "$@"
}

[[ -n "$(docker compose ps -q postgres)" ]] || fail "the development database container is not running (docker compose up -d postgres)."
[[ "$(psql_run -tA -c 'SELECT current_database()')" == "$db" ]] || fail "connected to an unexpected database."

if [[ "$execute" == true ]]; then
  if curl -s -m 3 -o /dev/null http://localhost:8080/api/products; then
    fail "a backend is running on port 8080. Stop it first so nothing writes during the cleanup."
  fi
  echo "Dry run first:"
  psql_run -v execute=false < scripts/cleanup-e2e-data.sql
  echo
  read -r -p "Delete the rows above from database '$db'? Type the database name to confirm: " answer
  [[ "$answer" == "$db" ]] || fail "not confirmed; nothing was changed."

  mkdir -p backups
  backup="backups/${db}-before-e2e-cleanup-$(date +%Y%m%d-%H%M%S).sql"
  docker compose exec -T postgres pg_dump -U "$DB_USERNAME" -d "$db" > "$backup"
  [[ -s "$backup" ]] || fail "the backup is empty; nothing was changed."
  echo "Backup written to backend/$backup"
  psql_run -v execute=true < scripts/cleanup-e2e-data.sql
else
  psql_run -v execute=false < scripts/cleanup-e2e-data.sql
fi
