# Production deployment

Two supported targets, same Python/Node code path, different host
plumbing:

| Host | Install | Service mgr | Recipe |
|---|---|---|---|
| **Windows** (office desktop) | `scripts\install-windows.ps1` | NSSM | [`docs/BARE_METAL_WINDOWS.md`](docs/BARE_METAL_WINDOWS.md) — operate, [`docs/FRESH_DEPLOY_FROM_SCRATCH.md`](docs/FRESH_DEPLOY_FROM_SCRATCH.md) — first deploy |
| **Linux / Proxmox LXC** | `scripts/install-linux.sh` | systemd | [`docs/BARE_METAL_LINUX.md`](docs/BARE_METAL_LINUX.md) — operate, [`docs/FRESH_DEPLOY_LXC.md`](docs/FRESH_DEPLOY_LXC.md) — first deploy |

There is no longer a Docker option in this repo.

## TL;DR

```
   browser ──https──▶  Cloudflare edge  ──https──▶  office-host:443
                          (proxied A)         (nginx — edge-proxy stack)
                                                       │
                            loopback                   │
                            ┌──────────────────────────┘
                            ▼
                    waitress (Flask backend) on 127.0.0.1:5000
                    next start  (Next.js) on 127.0.0.1:3000
                            │
                            └─▶  PostgreSQL 17, Redis 7, Celery worker, Celery beat
                                 (all running as Windows services on this host)
```

* TLS mode at Cloudflare: **Full (Strict)**.
* Origin certificate: Cloudflare-minted, RSA, 15-year, terminated by
  the edge-proxy nginx (lives in `C:\Apps\edge-proxy\`, not this repo).
* Cert minting recipe: in the edge-proxy stack's own
  `ssl/README.txt`.
* Anyone trying to reach the static IP directly (bypassing Cloudflare)
  gets a 403 from the edge proxy's `cf_edge` allowlist.

## What lives where

| Concern | Where | Owner |
|---|---|---|
| Postgres data | `C:\Program Files\PostgreSQL\17\data\` | PG installer |
| Redis | Memurai service or WSL2 | OS service |
| Backend code + venv | `C:\Apps\Employee-Housing-Control-Portal\backend\` | this repo |
| Frontend build | `C:\Apps\Employee-Housing-Control-Portal\frontend\.next\` | this repo |
| Backup `.dump` files | `C:\Apps\Employee-Housing-Control-Portal\..\backups\` or `BACKUP_FOLDER` env | configurable |
| Uploaded attachments | `..\uploads\` or `UPLOAD_FOLDER` env | configurable |
| Cloudflare Origin Cert | `C:\Apps\edge-proxy\ssl\origin.crt` + `origin.key` | edge-proxy stack |
| `nginx.conf` | `C:\Apps\edge-proxy\nginx.conf` | edge-proxy stack |
| Operator runbook | `docs\BARE_METAL_WINDOWS.md` | this repo |

## Day-2 ops cheatsheet

See [`docs/OPERATIONS_CHEATSHEET.txt`](docs/OPERATIONS_CHEATSHEET.txt).
