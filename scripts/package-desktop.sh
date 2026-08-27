#!/usr/bin/env bash
# Build a smaller, faster-to-download desktop ZIP.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="${1:-$(date -u +%Y%m%d)}"
NAME="Extractor-Desktop-Fast-${STAMP}"
OUT_DIR="${ROOT}/.local-fixtures"
STAGE="${OUT_DIR}/${NAME}"
ZIP="${OUT_DIR}/${NAME}.zip"

mkdir -p "$OUT_DIR"
rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"

tar -C "$ROOT" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='cloudflare-browser' \
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
  --exclude='tests' \
  --exclude='downloads' \
  --exclude='Dockerfile' \
  --exclude='Dockerfile.render-free' \
  --exclude='render.yaml' \
  --exclude='vercel.json' \
  --exclude='api' \
  -cf - . | tar -C "$STAGE" -xf -

cat > "$STAGE/START HERE.txt" <<'EOF'
EXTRACTOR — FAST LOCAL ONE-CLICK
================================

Windows
  1. Install Node.js 20+ and Python 3.11+
  2. Double-click: desktop\Install-Desktop-Shortcut.bat
  3. Forever after: Desktop "Extractor"

This fast package installs curl_cffi only on first run (much quicker).
Want full browsers later? Run desktop\Install-Full-Browsers.bat
EOF

chmod +x "$STAGE/desktop/"*.sh "$STAGE/desktop/"*.command 2>/dev/null || true

(
  cd "$OUT_DIR"
  zip -r -q "$NAME.zip" "$NAME"
)

SHA="$(sha256sum "$ZIP" | awk '{print $1}')"
echo "$SHA  $NAME.zip" > "${ZIP}.sha256"
# Also keep the classic name as a copy for existing links.
cp -f "$ZIP" "${OUT_DIR}/Extractor-Desktop-${STAMP}.zip"
cp -f "${ZIP}.sha256" "${OUT_DIR}/Extractor-Desktop-${STAMP}.zip.sha256"
echo "Created $ZIP"
echo "SHA-256 $SHA"
ls -lh "$ZIP"
