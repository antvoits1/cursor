#!/bin/bash
cd "$(dirname "$0")"
chmod +x ./START-EXTRACTOR.sh ./STOP-EXTRACTOR.sh ./Install-Desktop-Shortcut.sh 2>/dev/null || true
./START-EXTRACTOR.sh
