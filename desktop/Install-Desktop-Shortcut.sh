#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
START="$ROOT/desktop/START-EXTRACTOR.sh"
chmod +x "$ROOT/desktop/"*.sh "$ROOT/desktop/"*.command 2>/dev/null || true

DESKTOP="${HOME}/Desktop"
mkdir -p "$DESKTOP"

if [[ "$(uname -s)" == "Darwin" ]]; then
  TARGET="$DESKTOP/Extractor.command"
  cat > "$TARGET" <<EOF
#!/bin/bash
cd "$ROOT/desktop"
./START-EXTRACTOR.sh
EOF
  chmod +x "$TARGET"
  echo "Created: $TARGET"
  echo "Double-click Extractor.command on your Desktop anytime."
else
  TARGET="$DESKTOP/Extractor.desktop"
  cat > "$TARGET" <<EOF
[Desktop Entry]
Type=Application
Name=Extractor
Comment=Layered public-record extractor
Exec=$START
Icon=utilities-terminal
Terminal=true
Categories=Utility;
EOF
  chmod +x "$TARGET" "$START"
  echo "Created: $TARGET"
  echo "Double-click Extractor on your Desktop anytime."
fi
