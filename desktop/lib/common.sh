#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MARKER="$ROOT_DIR/.extractor-setup-done"
PORT="${PORT:-3000}"
URL="http://127.0.0.1:${PORT}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required tool: $1"
    echo "Install it, then run this again."
    exit 1
  fi
}

open_browser() {
  if command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
}

wait_for_health() {
  local i
  for i in $(seq 1 90); do
    if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

run_first_setup_if_needed() {
  need_cmd node
  need_cmd npm
  if command -v python3 >/dev/null 2>&1; then
    PYTHON=python3
  elif command -v python >/dev/null 2>&1; then
    PYTHON=python
  else
    echo "Missing required tool: python3"
    exit 1
  fi

  if [[ -f "$MARKER" ]]; then
    return 0
  fi

  echo "Fast first-time setup — installs the quick backend only..."
  echo "Optional full browsers can be added later with desktop/Install-Full-Browsers.sh"
  cd "$ROOT_DIR"
  npm ci
  npm run build

  if "$PYTHON" -m venv "$ROOT_DIR/.venv"; then
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.venv/bin/activate"
    python -m pip install --upgrade pip setuptools wheel
    python -m pip install -r backend/requirements-fast.txt
  else
    echo "Virtualenv unavailable; installing Python packages for this user instead."
    "$PYTHON" -m pip install --user --upgrade pip setuptools wheel
    "$PYTHON" -m pip install --user -r backend/requirements-fast.txt
  fi

  date -u +"%Y-%m-%dT%H:%M:%SZ setup-complete-fast" > "$MARKER"
  echo "Setup complete."
}

start_extractor() {
  run_first_setup_if_needed
  cd "$ROOT_DIR"

  if [[ -f "$ROOT_DIR/.venv/bin/activate" ]]; then
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.venv/bin/activate"
  fi

  export NODE_ENV=production
  export HOST=127.0.0.1
  export PORT
  export PATH="$ROOT_DIR/.venv/bin:$PATH"
  if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    export EXTRACTOR_PYTHON="$ROOT_DIR/.venv/bin/python"
  fi

  if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
    echo "Extractor is already running at $URL"
    open_browser
    return 0
  fi

  echo "Starting Extractor at $URL ..."
  nohup npm start > "$ROOT_DIR/.extractor.log" 2>&1 &
  echo $! > "$ROOT_DIR/.extractor.pid"

  if wait_for_health; then
    echo "Ready: $URL"
    open_browser
  else
    echo "Server did not become healthy. See .extractor.log"
    exit 1
  fi
}

stop_extractor() {
  if [[ -f "$ROOT_DIR/.extractor.pid" ]]; then
    local pid
    pid="$(cat "$ROOT_DIR/.extractor.pid" || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$ROOT_DIR/.extractor.pid"
  fi

  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
  elif command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${pids:-}" ]]; then
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null || true
      sleep 1
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
  echo "Extractor stopped."
}
