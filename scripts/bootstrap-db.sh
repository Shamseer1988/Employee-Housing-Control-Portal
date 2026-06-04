#!/usr/bin/env bash
# Initialize schema, run phase migrations, seed permissions/roles/super
# user. Run ONCE on a fresh PostgreSQL install. Subsequent restarts use
# scripts/start-all.sh (or systemd) which skip this step.
set -euo pipefail
cd "$(dirname "$0")/../backend"

if [[ ! -x ".venv/bin/flask" ]]; then
    echo "ERROR: backend/.venv/bin/flask missing — run scripts/install-linux.sh first." >&2
    exit 1
fi

export PYTHONUNBUFFERED=1
FLASK=".venv/bin/flask"

"$FLASK" --app wsgi wait-for-db
"$FLASK" --app wsgi init-db
"$FLASK" --app wsgi migrate-all
"$FLASK" --app wsgi seed

echo "Done. Run scripts/start-all.sh next, or install the systemd units."
