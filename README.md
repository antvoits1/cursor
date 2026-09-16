# ReactCRM-016 · Dashboard Visuals

Clean React/Vite source. Build 0.16 restyles 0.15 to the dashboard design system without changing CRM data, lead content, or business logic.

## Current build
- Inter throughout, including all revenue and financial figures.
- Dashboard tokens: canvas `#F2F4F8`, surfaces `#FFFFFF`, wells `#F7F8FC`, navy `#1E2235`, accents blue / teal / amber / navy.
- Stat-box treatment on detail cards: 1px `#E2E6F0` border, 9px radius, 13×16 padding, small shadow.
- Panel headers follow the dashboard title + count-pill / section-label layout.
- Navigation defaults to the dashboard navy `#1E2235`; communication and activity icons use the blue / teal / amber light tints.
- Middle panel: KPI strip (monthly revenue, requested, offer on file, current balance) with accent bars, position pill, carded sales pitch with blue accent edge, tinted activity icons.
- Account initials sit in a clean ~29px blue circle with ~12.5px initials. Lead rows have no initial circles.
- A real telephony dialer is embedded in the topbar (and the sidebar bottom). It uses the Twilio Voice WebRTC SDK; when Twilio is not configured it falls back to `ForgeTelephonyAdapter` / `forge:call-request`.
- Communications still has All / Messages / Calls / Contacts / Email.
- Panel widths stay draggable, saved locally, and resettable from Settings.

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

## Dialer (Twilio Voice)

The topbar dialer places **real** outbound calls through the [Twilio Voice
JavaScript SDK](https://www.twilio.com/docs/voice/sdks/javascript) (WebRTC). By
default (no active call) it shows a green call button and a number-entry field;
type a number and press the green button or `Enter` to dial. The red **End**
button and the mute / hold / keypad / line controls only appear once a call is
connecting or connected.

### How it works
1. The browser fetches a short-lived Twilio access token from `/api/token`.
2. `src/lib/telephony.ts` lazily creates a Twilio `Device`, registers it, and
   calls `device.connect({ params: { To, CallerId } })` to place the call.
3. Live-call actions map to the SDK: `call.mute()`, `call.disconnect()`,
   `call.sendDigits()` (DTMF).

If the backend has no Twilio credentials it returns `{ configured: false }`
(HTTP 200, never a 500) and the dialer shows an honest "Twilio not connected"
state instead of pretending to call.

### Environment variables (required for live calls)
Set these on the server (Vercel project env, or a local shell / `.env` — never
commit secrets):

| Variable | Purpose |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (`AC…`). |
| `TWILIO_API_KEY` | Twilio API Key SID (`SK…`). |
| `TWILIO_API_SECRET` | Twilio API Key secret. |
| `TWILIO_TWIML_APP_SID` | TwiML App SID (`AP…`) whose Voice webhook bridges the call. |
| `TWILIO_CALLER_ID` | A verified/purchased Twilio number used as the outbound caller ID. |
| `TWILIO_IDENTITY` | Optional client identity (defaults to `forge-agent`). |

### Create the TwiML App / voice webhook
Live PSTN calls require a TwiML App whose **Voice Request URL** points at a
webhook that dials the requested number, e.g.:

```xml
<!-- POST handler for the TwiML App Voice URL -->
<Response>
  <Dial callerId="{{TWILIO_CALLER_ID}}">
    <Number>{{To}}</Number>
  </Dial>
</Response>
```

Put that TwiML App's SID in `TWILIO_TWIML_APP_SID`. Without a reachable voice
webhook the WebRTC leg connects but no PSTN call is bridged.

### Backends
- `api/token.js` — Vercel serverless handler for `/api/token`.
- `server/token-server.mjs` — a tiny Express server for local development.

Run the local token server alongside the dev server (the Vite dev server
proxies `/api` to it on port `3001`):

```bash
npm run token-server   # terminal 1 — mints tokens (reads TWILIO_* env)
npm run dev            # terminal 2 — the app
```

### Honest limitations
- **Hold**: the Twilio JS Voice SDK has no native hold primitive. Hold is
  implemented as mic-mute plus a UI state; true hold (parking audio) requires a
  server-side TwiML `<Enqueue>`/`<Conference>` move. This is commented in
  `src/lib/telephony.ts`.
- Live calls require a Twilio account, the env vars above, and a TwiML voice
  webhook to bridge to the PSTN.
