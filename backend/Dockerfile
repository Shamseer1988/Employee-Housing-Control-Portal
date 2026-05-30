FROM python:3.14-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Build deps for psycopg2 + bcrypt, plus libmagic1 for python-magic
# (Phase 3 upload content-sniffing).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential libpq-dev curl libmagic1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

ENV FLASK_APP=wsgi.py \
    FLASK_ENV=production \
    UPLOAD_FOLDER=/data/uploads

EXPOSE 5000

# Drop privileges
RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app \
 && mkdir -p /data/uploads /data/backups \
 && chown -R app:app /app /data
USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:5000/api/v1/health || exit 1

CMD ["gunicorn", "-c", "gunicorn.conf.py", "wsgi:app"]
