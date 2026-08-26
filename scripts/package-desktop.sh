#!/usr/bin/env bash
# Build a downloadable desktop ZIP (no node_modules / .venv / secrets).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="${1:-$(date -u +%Y%m%d)}"
NAME="Extractor-Desktop-${STAMP}"
OUT_DIR="${ROOT}/.local-fixtures"
STAGE="${OUT_DIR}/${NAME}"
ZIP="${OUT_DIR}/${NAME}.zip"

mkdir -p "$OUT_DIR"
rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"

tar -C "$ROOT" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='cloudflare-browser/node_modules' \
  --exclude='.venv' \
  --exclude='dist' \
  --exclude='.local-fixtures' \
  --exclude='.extractor-setup-done' \
  --exclude='.extractor.log' \
  --exclude='.extractor.pid' \
  --exclude='.wrangler' \
  --exclude='__pycache__' \
  --exclude='.env' \
  --exclude='.env.local' \
  -cf - . | tar -C "$STAGE" -xf -

# Make the desktop folder the obvious entry point.
cat > "$STAGE/START HERE.txt" <<'EOF'
EXTRACTOR — LOCAL ONE-CLICK
===========================

Do NOT convert this to app.py. React + Node + Python is the correct layout.

Windows
  1. Install Node.js 20+ and Python 3.11+
  2. Double-click: desktop\Install-Desktop-Shortcut.bat
  3. Forever after: double-click Desktop "Extractor"

Mac
  1. Install Node.js 20+ and Python 3.11+
  2. Double-click: desktop/Install-Desktop-Shortcut.command
  3. Forever after: double-click Desktop "Extractor.command"

The first launch installs packages once. Later launches just open the app at
http://localhost:3000 with the full local backend (curl_cffi + browsers).
EOF

chmod +x "$STAGE/desktop/"*.sh "$STAGE/desktop/"*.command 2>/dev/null || true

(
  cd "$OUT_DIR"
  zip -r -q "$NAME.zip" "$NAME"
)

SHA="$(sha256sum "$ZIP" | awk '{print $1}')"
echo "$SHA  $NAME.zip" > "${ZIP}.sha256"
echo "Created $ZIP"
echo "SHA-256 $SHA"
