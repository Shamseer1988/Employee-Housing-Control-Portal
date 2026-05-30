#!/usr/bin/env bash
# Restore a gzipped pg_dump into the running 'db' service.
# Usage: scripts/restore.sh backups/pug-20260101T000000Z.sql.gz
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 path/to/dump.sql.gz" >&2
  exit 1
fi
FILE="$1"

if [ ! -f "$FILE" ]; then
  echo "Backup not found: $FILE" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "==> Restoring ${FILE}"
read -r -p "This will OVERWRITE the running database. Type 'yes' to continue: " ack
[ "$ack" = "yes" ] || { echo "Aborted."; exit 1; }

# Drop & recreate the public schema then pipe the dump in
docker compose exec -T db \
  psql -U "${POSTGRES_USER:-pug}" -d "${POSTGRES_DB:-pug_accommodation}" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

gunzip -c "$FILE" | docker compose exec -T db \
  psql -U "${POSTGRES_USER:-pug}" -d "${POSTGRES_DB:-pug_accommodation}"

echo "==> Restore complete. You may want to re-run: docker compose restart backend"
