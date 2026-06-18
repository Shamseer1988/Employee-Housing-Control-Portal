#!/usr/bin/env bash
# /opt/scripts/deploy.sh — post-initial-deploy update workflow.
#
# Use this AFTER the first-time setup in docs/FRESH_DEPLOY_LXC_EDGE.md
# is complete. It pulls the latest main, rebuilds the venv + frontend,
# runs any pending migrations, and bounces the four systemd services
# in the right order.
#
# Layout assumed (matches the LXC recipe):
#   /opt/housing                — git clone root
#   /opt/housing/backend/.env   — secrets (preserved across runs)
#   /opt/housing/frontend/.env.runtime
#   /var/lib/housing            — celery beat schedule
#   user: housing               — owns the repo + venv
#
# Run AS ROOT on the housing CT:
#     bash /opt/scripts/deploy.sh
#
# Override the repo root with REPO_ROOT=... if you ever move things.

set -Eeuo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/housing}"
SERVICE_USER="${SERVICE_USER:-housing}"
BACKUP_DIR="${BACKUP_DIR:-/opt/housing/backups}"
DB_NAME="${DB_NAME:-pug_accommodation}"
LOG="/var/log/housing-deploy.log"

# ldconfig lives in /usr/sbin — non-root login shells may not have it on
# PATH, which scripts/install-linux.sh needs to detect libmagic.
export PATH="/usr/sbin:$PATH"

# --- helpers ---------------------------------------------------------------
say()  { printf '\033[36m=== %s ===\033[0m\n' "$*" | tee -a "$LOG"; }
warn() { printf '\033[33m!!! %s\033[0m\n'    "$*" | tee -a "$LOG"; }
fail() { printf '\033[31mERR %s\033[0m\n'    "$*" | tee -a "$LOG"; exit 1; }

trap 'fail "deploy aborted on line $LINENO — services may be down; review $LOG"' ERR

# --- 0. preflight ----------------------------------------------------------
[[ $EUID -eq 0 ]]            || fail "run as root."
[[ -d "$REPO_ROOT/.git" ]]    || fail "$REPO_ROOT is not a git checkout."
[[ -d "$REPO_ROOT/backend" ]] || fail "$REPO_ROOT/backend missing."
id "$SERVICE_USER" >/dev/null || fail "user '$SERVICE_USER' does not exist."

mkdir -p "$BACKUP_DIR"
chown "$SERVICE_USER:$SERVICE_USER" "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG")"
: >> "$LOG"

say "housing deploy @ $(date -Iseconds)"
say "  repo : $REPO_ROOT"
say "  user : $SERVICE_USER"
say "  log  : $LOG"

# --- 1. snapshot db --------------------------------------------------------
say "Postgres backup (safety net)"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP="$BACKUP_DIR/pre-deploy-$STAMP.dump"
sudo -u postgres pg_dump -Fc "$DB_NAME" -f "$DUMP"
chown "$SERVICE_USER:$SERVICE_USER" "$DUMP"
say "  wrote $DUMP ($(du -h "$DUMP" | cut -f1))"

# --- 2. stop services (reverse dep order) ---------------------------------
say "Stopping services"
for svc in housing-frontend housing-beat housing-worker housing-backend; do
    systemctl stop "$svc" 2>/dev/null && echo "  $svc stopped" || echo "  $svc was not running"
done

# --- 3. pull ---------------------------------------------------------------
say "git pull origin main"
PREV_SHA="$(sudo -u "$SERVICE_USER" git -C "$REPO_ROOT" rev-parse HEAD)"
sudo -u "$SERVICE_USER" git -C "$REPO_ROOT" fetch --prune origin
sudo -u "$SERVICE_USER" git -C "$REPO_ROOT" pull --ff-only origin main
NEW_SHA="$(sudo -u "$SERVICE_USER" git -C "$REPO_ROOT" rev-parse HEAD)"

if [[ "$PREV_SHA" == "$NEW_SHA" ]]; then
    say "Already up to date ($NEW_SHA). Re-running install + migrate anyway."
else
    say "  $PREV_SHA -> $NEW_SHA"
    say "  changes:"
    sudo -u "$SERVICE_USER" git -C "$REPO_ROOT" \
        log --oneline --no-decorate "$PREV_SHA..$NEW_SHA" | sed 's/^/    /' | tee -a "$LOG"
fi

# --- 4. install deps + rebuild frontend -----------------------------------
say "scripts/install-linux.sh (venv + pip + npm ci + npm run build)"
sudo -u "$SERVICE_USER" PATH="/usr/sbin:$PATH" \
    bash -lc "cd '$REPO_ROOT' && bash scripts/install-linux.sh" 2>&1 | tee -a "$LOG"

# --- 5. run migrations -----------------------------------------------------
say "Database migrations"
sudo -u "$SERVICE_USER" bash -lc "cd '$REPO_ROOT/backend' && \
    set -a && . ./.env && set +a && \
    .venv/bin/flask --app wsgi wait-for-db && \
    .venv/bin/flask --app wsgi migrate-all" 2>&1 | tee -a "$LOG"

# --- 6. refresh systemd units (in case the unit files changed) ------------
say "Refreshing systemd units"
UNITS_SRC="$REPO_ROOT/deploy/systemd"
UNITS_CHANGED=0
if [[ -d "$UNITS_SRC" ]]; then
    for u in "$UNITS_SRC"/housing-*.service; do
        name="$(basename "$u")"
        if ! cmp -s "$u" "/etc/systemd/system/$name"; then
            cp "$u" "/etc/systemd/system/$name"
            echo "  updated $name"
            UNITS_CHANGED=1
        fi
    done
    if [[ $UNITS_CHANGED -eq 1 ]]; then
        systemctl daemon-reload
        say "  daemon-reload done"
    else
        echo "  no unit changes"
    fi
fi

# beat needs this dir to exist + be writable
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" /var/lib/housing

# --- 7. start services (forward dep order) --------------------------------
say "Starting services"
for svc in housing-backend housing-worker housing-beat housing-frontend; do
    systemctl start "$svc"
    echo "  $svc started"
done

# brief grace period so waitress + next start can bind
sleep 4

# --- 8. health check -------------------------------------------------------
say "Health check"
for svc in housing-backend housing-worker housing-beat housing-frontend; do
    if systemctl is-active --quiet "$svc"; then
        echo "  $svc : active"
    else
        warn "  $svc : INACTIVE — see 'journalctl -u $svc -n 50'"
    fi
done

# Read WAITRESS_LISTEN to pick the right curl target — works for topology
# A (127.0.0.1:5000) and B (0.0.0.0:5000) without editing the script.
LISTEN="$(grep -E '^WAITRESS_LISTEN=' "$REPO_ROOT/backend/.env" | cut -d= -f2- | tr -d '"' || true)"
LISTEN="${LISTEN:-127.0.0.1:5000}"
HEALTH_HOST="${LISTEN/0.0.0.0/127.0.0.1}"
if curl -fsS "http://$HEALTH_HOST/api/v1/health" >/dev/null; then
    say "Backend /health OK"
else
    warn "Backend /health FAILED — services up but app not responding cleanly"
fi

say "Done at $(date -Iseconds). Snapshot: $DUMP"
say "Rollback: systemctl stop housing-* && \\"
say "  sudo -u $SERVICE_USER git -C $REPO_ROOT reset --hard $PREV_SHA && \\"
say "  sudo -u postgres pg_restore --clean --if-exists -d $DB_NAME $DUMP && \\"
say "  bash /opt/scripts/deploy.sh   # rebuild from the rolled-back code"
