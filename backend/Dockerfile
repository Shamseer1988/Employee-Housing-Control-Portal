# syntax=docker/dockerfile:1.6
# =============================================================================
# Multi-stage build.
#
# Stage 1 (builder) installs the heavy toolchain (build-essential, libpq-dev,
# libssl-dev) needed to compile psycopg2 / bcrypt wheels, builds wheels into
# /wheels, then we throw the whole stage away.
#
# Stage 2 (runtime) ships only Python + the runtime shared libs (libpq5,
# libmagic1, curl) and pip-installs the prebuilt wheels. Saves ~250 MB on
# the final image and shrinks the CVE surface scanned by trivy.
# =============================================================================

FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential libpq-dev libssl-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .
# Build wheels for every dep so the runtime stage doesn't need a compiler.
RUN pip wheel --wheel-dir=/wheels -r requirements.txt


FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Runtime-only system libs:
#   * libpq5 / libmagic1 — psycopg2 + python-magic (upload sniffing)
#   * curl — HEALTHCHECK below
#   * postgresql-client — pg_dump / pg_restore used by the backup module.
#     Pinned to the same major as the db service (currently 17). When
#     bumping postgres, bump this too — pg_dump's major must be >= the
#     server's major.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        libpq5 libmagic1 curl postgresql-client \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /wheels /wheels
COPY requirements.txt .
RUN pip install --no-index --find-links=/wheels -r requirements.txt \
 && rm -rf /wheels

COPY . .

ENV FLASK_APP=wsgi.py \
    FLASK_ENV=production \
    UPLOAD_FOLDER=/data/uploads

EXPOSE 5000

# Drop privileges
RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app \
 && mkdir -p /data/uploads /data/backups /data/backups-imports \
 && chown -R app:app /app /data
USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:5000/api/v1/health || exit 1

CMD ["gunicorn", "-c", "gunicorn.conf.py", "wsgi:app"]
