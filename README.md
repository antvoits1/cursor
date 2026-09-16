# ReactCRM-016 · Dashboard Visuals

Clean React/Vite source. Build 0.16 restyles 0.15 to the dashboard design system without changing CRM data, lead content, or business logic.

## Current build
- Inter throughout, including all revenue and financial figures.
- Dashboard tokens: canvas `#F2F4F8`, surfaces `#FFFFFF`, wells `#F7F8FC`, navy `#1E2235`, accents blue / teal / amber / navy.
- Stat-box treatment on detail cards: 1px `#E2E6F0` border, 9px radius, 13×16 padding, small shadow.
- Panel headers follow the dashboard title + count-pill / section-label layout.
- Navigation defaults to the dashboard navy `#1E2235`; communication and activity icons use the blue / teal light tints.
- Middle panel: KPI strip (monthly revenue, approval amount, offer on file, current balance), carded sales pitch with blue accent edge, tinted activity icons.
- Account initials sit in a clean ~29px blue circle with ~12.5px initials. Lead rows have no initial circles.
- Message threads use iOS-style bubbles with corner timestamps and read receipts.
- Communications still has All / Messages / Calls / Contacts / Email.
- Panel widths stay draggable, saved locally, and resettable from Settings.

## Calling
The CRM does not embed a softphone. A call action hands the number to the host
environment instead:

1. `window.ForgeTelephonyAdapter.startCall({ number, leadId })` when a native
   shell (Electron / mobile) has installed an adapter.
2. Otherwise a cancelable `forge:call-request` CustomEvent is dispatched on
   `window`; a listener calls `preventDefault()` to claim it.

When nothing handles the request the CRM shows "Connect a phone or calling
provider to place calls." It never navigates the app to a `tel:` URL.

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
