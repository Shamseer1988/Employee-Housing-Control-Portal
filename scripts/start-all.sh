#!/usr/bin/env bash
# Start every process the housing app needs, in the right order.
#
# This is the DEV / smoke-test launcher. For real production use the
# systemd units under deploy/systemd/ — see docs/BARE_METAL_LINUX.md §4.
#
# Logs go to /tmp/housing-*.log so you can `tail -f` them.
# Run `bash scripts/stop-all.sh` to kill everything.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PIDFILE="/tmp/housing-pids"
: > "$PIDFILE"

LISTEN="${WAITRESS_LISTEN:-127.0.0.1:5000}"
THREADS="${WAITRESS_THREADS:-8}"

launch() {
    local name=$1; local logfile=$2; local workdir=$3; shift 3
    echo "  starting $name → $logfile"
    (cd "$workdir" && exec "$@" >"$logfile" 2>&1) &
    local pid=$!
    echo "$name $pid" >> "$PIDFILE"
}

printf '\033[36mStarting backend / worker / beat / frontend …\033[0m\n'

launch housing-backend  /tmp/housing-backend.log  "$BACKEND" \
    "$BACKEND/.venv/bin/waitress-serve" --listen="$LISTEN" --threads="$THREADS" wsgi:app

sleep 3

launch housing-worker   /tmp/housing-worker.log   "$BACKEND" \
    "$BACKEND/.venv/bin/celery" -A celery_worker.celery worker --loglevel=info

launch housing-beat     /tmp/housing-beat.log     "$BACKEND" \
    "$BACKEND/.venv/bin/celery" -A celery_worker.celery beat --loglevel=info \
    --schedule=/tmp/celerybeat-schedule

launch housing-frontend /tmp/housing-frontend.log "$FRONTEND" \
    npm start

cat <<EOF

PIDs recorded in $PIDFILE.
Tail logs:
  tail -f /tmp/housing-backend.log
  tail -f /tmp/housing-frontend.log
Health:
  curl http://127.0.0.1:5000/api/v1/health
  curl http://127.0.0.1:3000
Stop:
  bash scripts/stop-all.sh
EOF
