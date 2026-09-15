# ---------------------------------------------------------------------------
# TIMS classification service
#
# Build from the REPOSITORY ROOT, not from this directory:
#
#   docker build -f ml-service/Dockerfile -t tims-ml .
#   docker compose up -d ml-service
#
# The wider context is deliberate: it lets the image copy the trained artefact
# straight out of ml/models/, so the model exists in exactly one place in the
# repository instead of being duplicated into ml-service/models/.
#
# Two-stage build: wheels are compiled in the builder and only the resulting
# virtualenv is carried forward, keeping build toolchains out of the runtime.
# ---------------------------------------------------------------------------

FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# Build tooling for any package without a manylinux wheel for this platform.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY ml-service/requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install -r requirements.txt


FROM python:3.12-slim AS runtime

# libgomp is required by both xgboost and scikit-learn at runtime; without it
# the import fails with an OMP error that is hard to trace back.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MODEL_PATH=/app/models/classifier.joblib \
    MODEL_METADATA_PATH=/app/models/model_metadata.json \
    PORT=8000

WORKDIR /app

COPY ml-service/main.py .

# The trained artefact is baked in, so the container is self-contained and its
# model version is pinned to the image tag. Read from ml/models/ — the single
# copy in the repository. Mount over /app/models to override at run time.
COPY ml/models/classifier.joblib ml/models/model_metadata.json /app/models/

# Non-root: the service needs no write access to anything.
RUN useradd --create-home --shell /usr/sbin/nologin tims \
    && chown -R tims:tims /app
USER tims

EXPOSE 8000

# Reports unhealthy when the model failed to load, not merely when the port is
# open — a service that cannot predict should not receive traffic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health | grep -q '"status":"ok"' || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
