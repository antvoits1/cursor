#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.venv/bin/activate"
  PYTHON=python
else
  if command -v python3 >/dev/null 2>&1; then PYTHON=python3; else PYTHON=python; fi
fi

echo "Installing optional full browser tiers (Patchright + Camoufox)..."
echo "This download is large and can take a long time."
"$PYTHON" -m pip install -r backend/requirements.txt
"$PYTHON" -m patchright install chromium || true
"$PYTHON" -m camoufox fetch || true
echo "Full browser tiers installed. Restart Extractor to use them."
