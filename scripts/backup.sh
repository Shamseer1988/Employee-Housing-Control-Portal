#!/usr/bin/env bash
# Dump the PUG Accommodation database into ./backups with a timestamp,
# then prune dumps older than $RETENTION_DAYS (default 30).
set -euo pipefail

cd "$(dirname "$0")/.."
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="backups/pug-${STAMP}.sql.gz"

mkdir -p backups

echo "==> pg_dump → ${OUT}"
docker compose exec -T db \
  pg_dump -U "${POSTGRES_USER:-pug}" "${POSTGRES_DB:-pug_accommodation}" \
  | gzip -9 > "${OUT}"

echo "==> Pruning dumps older than ${RETENTION_DAYS} days"
find backups -name "pug-*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -delete

echo "==> Done. Latest:"
ls -lh backups | tail -3
