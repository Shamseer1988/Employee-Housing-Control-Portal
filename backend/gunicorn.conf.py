"""Gunicorn config for the PUG Accommodation backend."""
import multiprocessing
import os

bind = os.getenv("GUNICORN_BIND", "0.0.0.0:5000")

# Reasonable default: 2 * cores + 1 (Gunicorn docs recommendation), capped at 16.
workers = int(os.getenv("GUNICORN_WORKERS", min(multiprocessing.cpu_count() * 2 + 1, 16)))
worker_class = "sync"
threads = int(os.getenv("GUNICORN_THREADS", 4))

timeout = int(os.getenv("GUNICORN_TIMEOUT", 60))
graceful_timeout = 30
keepalive = 5

max_requests = 1000
max_requests_jitter = 50

# Logs go to stdout/stderr so Docker / journald can pick them up.
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s %(L)ss "%(f)s" "%(a)s"'

proc_name = "pug-accommodation-api"
