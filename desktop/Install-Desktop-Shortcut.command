#!/bin/bash
cd "$(dirname "$0")"
chmod +x ./Install-Desktop-Shortcut.sh ./START-EXTRACTOR.sh 2>/dev/null || true
./Install-Desktop-Shortcut.sh
echo
read -r -p "Press Enter to close..."
