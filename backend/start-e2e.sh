#!/usr/bin/env bash
# Starts a fresh, throwaway PostgreSQL (compose service postgres-e2e, port 5434, data in tmpfs) and runs the application
# against it with the `e2e` profile on port 8090. Used by the Playwright E2E tests; never touches the development
# database (service postgres, port 5433) or the backend on port 8080. The E2E database is removed when this stops.
set -euo pipefail
cd "$(dirname "$0")"

fail() {
  echo "Error: $*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "docker is not installed."
docker info >/dev/null 2>&1 || fail "the Docker daemon is not running."
docker compose version >/dev/null 2>&1 || fail "the Docker Compose plugin is not available."
[[ -f .env ]] || fail "backend/.env not found. Create it with: cd backend && cp .env.example .env"
chmod +x mvnw

# compose.yaml needs the DB_* variables to parse; the e2e profile ignores them.
set -a
# shellcheck disable=SC1091
source .env
set +a
# Environment variables would override application-e2e.properties; make sure none can redirect the E2E backend.
unset DB_URL DB_USERNAME DB_PASSWORD DB_PORT SPRING_DATASOURCE_URL SPRING_DATASOURCE_USERNAME SPRING_DATASOURCE_PASSWORD
unset SERVER_PORT SPRING_PROFILES_ACTIVE
export DB_USERNAME=unused DB_PASSWORD=unused

cleanup() {
  docker compose --profile e2e rm -sf -v postgres-e2e >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
echo "Starting the E2E database (fresh, in memory)..."
docker compose --profile e2e up -d --wait postgres-e2e

./mvnw spring-boot:run -Dspring-boot.run.profiles=e2e
