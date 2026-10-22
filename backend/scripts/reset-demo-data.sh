#!/usr/bin/env bash
# Resets the demo data by hand: deletes every product, reservation, order, shipment and return, then loads the sample
# data (V2__sample_data.sql) again, all in one transaction. Nothing schedules this script.
#
#   ./scripts/reset-demo-data.sh          local development database (compose service `postgres`)
#   ./scripts/reset-demo-data.sh --psql   the database named by the standard libpq variables (PGHOST, PGPORT,
#                                         PGDATABASE, PGUSER, PGPASSWORD), e.g. the deployed demo through a tunnel
#
# The backend may keep running: the reset waits for running transactions, and visitors see either the old or the new
# data. Asks for the database name before changing anything.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() {
  echo "Error: $*" >&2
  exit 1
}

case "${1:-}" in
  "")
    command -v docker >/dev/null 2>&1 || fail "docker is not installed."
    [[ -f .env ]] || fail "backend/.env not found."
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
    : "${DB_USERNAME:?DB_USERNAME must be set in .env}"
    [[ -n "$(docker compose ps -q postgres)" ]] || fail "the development database container is not running (docker compose up -d postgres)."
    psql_run() {
      docker compose exec -T postgres psql -U "$DB_USERNAME" -d inventory -v ON_ERROR_STOP=1 "$@"
    }
    ;;
  --psql)
    command -v psql >/dev/null 2>&1 || fail "psql is not installed."
    : "${PGDATABASE:?set PGDATABASE (and PGHOST, PGPORT, PGUSER, PGPASSWORD as needed)}"
    psql_run() {
      psql -v ON_ERROR_STOP=1 "$@"
    }
    ;;
  *) fail "usage: $0 [--psql]" ;;
esac

db="$(psql_run -tA -c 'SELECT current_database()')"
echo "Database '$db' currently holds:"
psql_run -tA -c "SELECT (SELECT count(*) FROM product) || ' products, '
                     || (SELECT count(*) FROM reservation) || ' reservations, '
                     || (SELECT count(*) FROM customer_order) || ' orders'"
read -r -p "Delete ALL of it and reload the sample data? Type the database name to confirm: " answer
[[ "$answer" == "$db" ]] || fail "not confirmed; nothing was changed."

{
  echo 'BEGIN;'
  cat scripts/reset-demo-data.sql
  cat src/main/resources/db/migration/V2__sample_data.sql
  echo 'COMMIT;'
} | psql_run -q

echo "Done. Database '$db' now holds:"
psql_run -tA -c "SELECT (SELECT count(*) FROM product) || ' products, '
                     || (SELECT count(*) FROM customer_order) || ' orders'"
