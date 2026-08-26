================================================================================
EXTRACTOR — ONE-CLICK DESKTOP
================================================================================

Do you need app.py?
  No. Keep this React + Node + Python layout. Changing to a single app.py would
  remove the browser UI and the extraction engine that already works.

What this does
  Runs the full extractor on YOUR computer so Patchright and Camoufox can work.
  No Vercel / Render / Cloudflare required for normal use.

One-time setup
  1. Install Node.js 20+ from https://nodejs.org
  2. Install Python 3.11+ from https://www.python.org
  3. Unzip this folder anywhere (example: Documents\Extractor)
  4. Double-click Install-Desktop-Shortcut.bat  (Windows)
     or Install-Desktop-Shortcut.command       (Mac)

Every time after that
  Double-click the "Extractor" shortcut on your Desktop.
  Your browser opens to http://localhost:3000

First launch takes longer (downloads npm packages, curl_cffi, Chromium,
Camoufox). Later launches are quick.

Windows files
  Install-Desktop-Shortcut.bat   — creates the Desktop shortcut once
  START-EXTRACTOR.bat            — starts the app (what the shortcut runs)
  STOP-EXTRACTOR.bat             — stops the local server

Mac / Linux files
  Install-Desktop-Shortcut.command / .sh
  START-EXTRACTOR.command / .sh
  STOP-EXTRACTOR.sh
================================================================================
