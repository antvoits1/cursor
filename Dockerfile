FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/patchright-browsers \
    CAMOUFOX_CACHE_DIR=/opt/camoufox-cache \
    PATH=/opt/venv/bin:$PATH

WORKDIR /app

# Python stays in a virtual environment so Debian's system Python remains
# untouched. Patchright installs Chromium's Linux libraries while the image is
# still root; both browser caches are shared with the non-root runtime user.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --upgrade pip setuptools wheel \
    && pip install -r backend/requirements.txt \
    && patchright install --with-deps chromium \
    && mkdir -p "$CAMOUFOX_CACHE_DIR" \
    && python -m camoufox fetch \
    && chmod -R a+rX "$PLAYWRIGHT_BROWSERS_PATH" "$CAMOUFOX_CACHE_DIR" /opt/venv

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY --chown=node:node . .
RUN npm run build \
    && mkdir -p /data \
    && chown -R node:node /data /app

USER node

ENV HOST=0.0.0.0 \
    PORT=10000 \
    EXTRACTOR_RUNTIME_DIR=/data

EXPOSE 10000

CMD ["npm", "start"]
