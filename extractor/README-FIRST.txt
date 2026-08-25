EXTRACTOR — AUG 21 PHASE 2 — ONE-CLICK WINDOWS SETUP v3

1. Extract this ZIP.
2. Double-click SETUP-EXTRACTOR.vbs once.
3. Wait for the completion message.
4. From then on, double-click the Extractor desktop shortcut.

No Command Prompt or PowerShell window appears during normal launches.
The backend starts silently and opens the local Extractor in your default browser.

v3 specifically fixes the pip-cache warning that stopped v2:
- clears pip cache when possible
- installs packages with --no-cache-dir
- judges native installer commands by exit code only
- captures warning/error text to a Temp log instead of treating warnings as setup failures
- installs into a new v3 folder so earlier partial installs cannot collide
