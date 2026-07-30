# Entify backend.
#
# Semantic blocking is not installed by default. It pulls in torch, which adds
# roughly 600MB to the image for a feature many deployments never use. Build
# with --build-arg SEMANTIC=1 to include it.

FROM python:3.14-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Requirements are copied on their own so a source change does not invalidate
# the dependency layer. Splink and its dependencies take minutes to install.
COPY requirements.txt requirements-semantic.txt ./

ARG SEMANTIC=0
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$SEMANTIC" = "1" ]; then \
         pip install --no-cache-dir -r requirements-semantic.txt; \
       fi

COPY . .

# Persistent state lives under /data so a volume mount survives rebuilds.
# Without ENTIFY_DB_PATH the engine stays in memory and everything is lost on
# restart, which is not what someone running this as a service expects.
ENV ENTIFY_DB_PATH=/data/entify.duckdb \
    ENTIFY_TEMP_DIR=/data/tmp \
    ENTIFY_CORS_ORIGINS=http://localhost:3000
RUN mkdir -p /data/tmp

# Run as a non-root user. The container handles uploaded customer data, so a
# container escape should not also be a root escape.
RUN useradd --create-home --shell /bin/false entify \
    && chown -R entify:entify /app /data
USER entify

EXPOSE 8000

# Checks the real health endpoint rather than just process liveness: the API
# can be up while the engine is unusable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
