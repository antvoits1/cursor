# Desk Phone 0.16 · PC dialer

Standalone Windows-style Phone Link replacement. There is no CRM, no lead book, and no fake iPhone chrome. The running app is a full-window desk dialer: Messages, Recents, Contacts, Mail, and an always-on keypad.

All visual rules live in one file: `src/index.css`. There is no Tailwind, no extra CSS files, and no utility-class overlays.

## Current build
- Inter throughout.
- Dashboard tokens: canvas `#F2F4F8`, surfaces `#FFFFFF`, wells `#F7F8FC`, navy `#1E2235`, accents blue `#3B6FD4` / teal `#1A8F7A` / amber `#C97B2A`.
- Left rail for Messages / Recents / Contacts / Mail. The dialer stays on the right so a number can be typed immediately.
- Multiple Bluetooth phones appear as chips. Switching a chip filters MAP/PBAP data to that device.
- Auto-extract runs when the connected-phone set changes (`/refresh-inbox`, `/calls`, `/contacts`).
- Digit keys, `*`, `#`, Backspace, and Enter are recognized while not typing in a field. Enter places the call. Enter also sends SMS and mail from those composers.
- Local DTMF tones play for 0–9 `*` `#`. Those tones are in the desk phone only. The Windows HFP client does not send in-call tones.
- Settings store a Windows bridge token from `%LOCALAPPDATA%\iPhoneLinkCRM\bridge-token.txt`. The local mock does not require a token.

## Calling
This app does not embed Twilio or a browser softphone. A call action hands the number to the host in this order:

1. `window.ForgeTelephonyAdapter.startCall({ number })` when a native shell has installed an adapter.
2. `POST http://127.0.0.1:8765/call` when the Windows Phone Link bridge (or the local mock) is reachable. That path dials with HFP `ATD{number};` on the real engine.
3. Otherwise a cancelable `forge:call-request` CustomEvent is dispatched on `window`.

When nothing handles the request the app shows "Connect a Bluetooth phone through the Windows bridge to place calls." It never navigates to a `tel:` URL.

Hang-up posts `/hangup` when the bridge advertises it (the mock does). The real C# engine in the attached zip has `AT+CHUP` in the HFP client but no HTTP hang-up route, so the UI then says to hang up on the phone.

SMS send uses `POST /send-sms` (MAP PushMessage) when the bridge accepts it. Otherwise it opens the system `sms:` handler. WhatsApp remains an outbound `wa.me` link. Mail uses `mailto:` with the selected address. This is not iMessage, FaceTime, Gmail, or Outlook.

## Two phones
On a Windows PC with the C# engine running, paired phones that expose MAP/PBAP/HFP show up from `GET /devices`. This Linux/browser build cannot open Windows Bluetooth RFCOMM, so `scripts/mock-phone-bridge.mjs` presents two connected devices (`iPhone`, `Pixel 8`) with `authRequired: false` and `mock: true`. The UI banners that state. It is not a fake Phone Link pairing.

The real C# `SelectBridgeDeviceAsync` largely honors `selected` / round-robin, not arbitrary web device IDs. The mock honors the `device` field so both phones can be exercised here.

## Run
```bash
npm ci
npm run mock-bridge
npm run dev
```

Open `http://localhost:3000/`. Paste a real token in Settings only when talking to the Windows engine.

## Verify
```bash
npm run lint
npm run audit
npm run build
```

## Downloads
- `downloads/DeskPhone-016.zip` — only the files needed to run the desk phone.

Refresh with `npm run pack`.

## Audit of the attached iPhoneLink-Desktop-Setup.zip
Reviewed as source only. Nothing below is claimed to work in this cloud environment.

What it actually is:
- A .NET 8 WinForms project (`PhoneLinkDiag`, 31 C# files, assembly name `iPhoneLinkCRM`).
- Real Bluetooth profile clients: MAP (`0x1132`) for SMS listing/push, PBAP (`0x112F`) for contacts and call history, HFP (`0x111E`/`0x111F`) for `ATD{number};` and `AT+CHUP`.
- A local HTTP bridge on `http://127.0.0.1:8765/` with token file `%LOCALAPPDATA%\iPhoneLinkCRM\bridge-token.txt`. `/health` is public; devices/messages/contacts/calls/send-sms/call need the token.
- SQLite cache for MAP inbox history (`message_history`).
- A WebView2 `ShellForm` that opens a **430×920 phone-sized window**. Desk Phone does not use that shell.

What the zip claims that the files do not honestly deliver:
- It is not Apple iMessage, not Continuity, and not Microsoft Phone Link internals.
- The HTML shell invents iMessage labels, FaceTime, Voicemail, and demo people. Desk Phone does not.
- No DTMF (`AT+VTS`) exists in `HfpDialerClient`.
- Email in WinForms is a placeholder.

Honest capabilities worth keeping:
- HFP dial `ATD{sanitized};` after an explicit call action.
- MAP inbox/sent listing and MAP SMS push.
- PBAP read-only phone book plus call-history books.
- Multi-device isolation in the engine. The operating system still decides which profiles a given iPhone/Android exposes.
