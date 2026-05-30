"""Gunicorn config for the PUG Accommodation backend."""
import multiprocessing
import os

bind = os.getenv("GUNICORN_BIND", "0.0.0.0:5000")

# Reasonable default: 2 * cores + 1 (Gunicorn docs recommendation), capped at 16.
workers = int(os.getenv("GUNICORN_WORKERS", min(multiprocessing.cpu_count() * 2 + 1, 16)))
# gthread, not sync: the SSE /events/stream endpoint holds a connection
# open for the whole stream window. A sync worker would be blocked for
# that entire time; gthread parks it on a thread + selector so other
# requests keep flowing.
worker_class = "gthread"
threads = int(os.getenv("GUNICORN_THREADS", 8))

timeout = int(os.getenv("GUNICORN_TIMEOUT", 120))
graceful_timeout = 30
# Keep idle upstream keep-alive connections open LONGER than the clients
# that pool them (the Next.js /api proxy, nginx in prod). If gunicorn
# closes a pooled socket first, the next request on it fails with
# ECONNRESET -> "socket hang up" -> pages randomly stuck loading.
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", 75))

max_requests = 1000
max_requests_jitter = 50

# Logs go to stdout/stderr so Docker / journald can pick them up.
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s %(L)ss "%(f)s" "%(a)s"'

proc_name = "pug-accommodation-api"
