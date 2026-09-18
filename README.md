# ReactCRM-016 · Dashboard Visuals

Clean React/Vite source. Build 0.16 restyles 0.15 to the dashboard design system without changing CRM data, lead content, or business logic.

All visual rules live in one file: `src/index.css`. There is no Tailwind, no extra CSS files, and no utility-class overlays.

## Current build
- Inter throughout, including all revenue and financial figures.
- Dashboard tokens: canvas `#F2F4F8`, surfaces `#FFFFFF`, wells `#F7F8FC`, navy `#1E2235`, accents blue `#3B6FD4` / teal `#1A8F7A` / amber `#C97B2A` / navy `#1E2235`.
- Communications is a compact Phone Link dock nested inside the full-width lead record, not a fake iPhone.
- Dialer opens first. Digit keys, `*`, `#`, Backspace, and Enter are recognized while the dialer is open. Enter places the call. Enter also sends SMS and mail from those composers.
- Local DTMF tones play for 0–9 `*` `#`. Those tones are in the CRM only. The Windows HFP client does not send `AT+VTS`.
- Multiple Bluetooth phones appear as chips when the Windows bridge reports them. Multiple lead email addresses can be selected in Mail.
- Panel widths stay draggable through invisible 12px hit areas, saved under `forge.react.v16.panel.*`, and resettable from Settings.
- UI settings persist under `forge-crm-ui-settings-v16`.
- Five original leads only, in `src/data.ts`.

## Calling
The CRM does not embed Twilio or a browser softphone. A call action hands the number to the host in this order:

1. `window.ForgeTelephonyAdapter.startCall({ number, leadId })` when a native shell has installed an adapter.
2. `POST http://127.0.0.1:8765/call` when the Windows Phone Link bridge injected a token and a phone is available. That path dials with HFP `ATD{number};`.
3. Otherwise a cancelable `forge:call-request` CustomEvent is dispatched on `window`.

When nothing handles the request the CRM shows "Connect a Bluetooth phone through the Windows bridge to place calls." It never navigates the app to a `tel:` URL.

SMS send uses the same bridge (`POST /send-sms` → MAP PushMessage) when authenticated. Otherwise it opens the system `sms:` handler. WhatsApp remains an outbound `wa.me` link. Mail uses `mailto:` with the selected address. This is not iMessage, FaceTime, Gmail, or Outlook.

## Bluetooth extraction
`src/lib/bridge.ts` polls `http://127.0.0.1:8765/health` every four seconds. Protected routes need `window.IPHONELINK_TOKEN` from a desktop shell. When the connected-device set changes, the CRM requests `/refresh-inbox`, `/calls`, and `/contacts` and labels that data "From the connected phone" / "On phone". If the bridge is down, the five CRM leads stay visible and nothing is invented.

This Linux/browser build cannot open Windows Bluetooth RFCOMM. Auto-extract only happens on a Windows machine where the C# engine is running.

## Downloads
- `downloads/DeskPhoneCRM-016.zip` — only the files needed to run the app.

Refresh with `npm run pack`.

## Run
```bash
npm ci
npm run dev
```

## Verify
```bash
npm run lint
npm run audit
npm run build
```

## Audit of the attached iPhoneLink-Desktop-Setup.zip
Reviewed as source only. Nothing below is claimed to work in this cloud environment.

What it actually is:
- A .NET 8 WinForms project (`PhoneLinkDiag`, 31 C# files, assembly name `iPhoneLinkCRM`).
- Real Bluetooth profile clients: MAP (`0x1132`) for SMS listing/push, PBAP (`0x112F`) for contacts and call history, HFP (`0x111E`/`0x111F`) for `ATD{number};` and `AT+CHUP`.
- A local HTTP bridge on `http://127.0.0.1:8765/` with token file `%LOCALAPPDATA%\iPhoneLinkCRM\bridge-token.txt`. `/health` is public; devices/messages/contacts/calls/send-sms/call need the token.
- SQLite cache for MAP inbox history (`message_history`). That is why a download can look like a database.
- VBS installers that publish from source with the .NET 8 SDK, then create a desktop shortcut.
- A WebView2 `ShellForm` that opens a **430×920 phone-sized window** and loads a bundled HTML shell. It is not a CRM desktop shell.

What the zip claims that the files do not honestly deliver:
- README: "Real Windows app: Bluetooth MAP/PBAP/HFP backend + iPhone shell" and "It syncs messages, contacts, and calls from paired iPhone/Android over Bluetooth." Sync is attempted over public Bluetooth profiles the phone exposes. It is not Apple iMessage, not Continuity, and not Phone Link internals. The clean-room notes say not to copy Microsoft Phone Link.
- The HTML shell invents iMessage labels, FaceTime, Voicemail, a keypad in-call UI, and ~25 demo people (Mom, Uber, Apple, Jordan Hale). That demo book is not the five Forge leads and is not live extraction.
- `ATTACHED.md` says there is no Sync Contacts toggle and that contacts auto-sync. `MainForm` still has `_syncContactsToggle` and optional PBAP contact import.
- No DTMF (`AT+VTS`) exists in `HfpDialerClient`. No keyboard-to-dialer handling exists in the HTML shell beyond clicking keys. Enter does not call.
- Email page in WinForms is a placeholder: "No email mailbox is connected."
- `MainForm.cs` is a ~3,900-line diagnostic console (grids, packet logs, OBEX probes, SQLite). Hiding it off-screen and showing the HTML shell is why the "desktop app" felt like a database with a bad phone painted on top.
- Install requires .NET 8 SDK and WebView2. This package is source, not a prebuilt exe. Bluetooth APIs need Windows 10 19041+.
- The HTML shell's drag-tilt 3D frame is cosmetic. It does not make Bluetooth work.

Honest capabilities worth keeping:
- HFP dial `ATD{sanitized};` after an explicit call action.
- MAP inbox/sent listing (default 250) and MAP SMS push, keyed by `DeviceId + Folder + Handle`.
- PBAP read-only `telecom/pb.vcf` plus call-history books `cch/ich/och/mch`.
- Multi-device isolation in the engine. The operating system still decides which profiles a given iPhone/Android exposes.
