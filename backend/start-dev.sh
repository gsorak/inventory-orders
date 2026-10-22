#!/usr/bin/env bash
# Starts PostgreSQL (Docker Compose), waits until it is ready, then runs the application.
# Flyway applies pending migrations on application startup.
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

set -a
# shellcheck disable=SC1091
source .env
set +a
: "${DB_USERNAME:?DB_USERNAME must be set in .env}"
: "${DB_PASSWORD:?DB_PASSWORD must be set in .env}"

docker compose up -d postgres

echo "Waiting for PostgreSQL..."
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "$DB_USERNAME" -d inventory >/dev/null 2>&1; then
    echo "PostgreSQL is ready."
    exec ./mvnw spring-boot:run
  fi
  sleep 1
done
fail "PostgreSQL did not become ready in time (see: docker compose logs postgres)."
