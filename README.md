# ReactCRM-016 · Dashboard Visuals

Clean React/Vite source. Build 0.16 restyles 0.15 to the dashboard design system without changing CRM data, lead content, or business logic.

All visual rules live in one file: `src/index.css`. There is no Tailwind, no extra CSS files, and no utility-class overlays.

## Current build
- Inter throughout, including all revenue and financial figures.
- Dashboard tokens: canvas `#F2F4F8`, surfaces `#FFFFFF`, wells `#F7F8FC`, navy `#1E2235`, accents blue `#3B6FD4` / teal `#1A8F7A` / amber `#C97B2A` / navy `#1E2235`.
- Stat-box treatment on detail cards: 1px `#E2E6F0` border, 9px radius, 13×16 padding, small shadow.
- Panel headers follow the dashboard title + count-pill / section-label layout.
- Navigation defaults to the dashboard navy `#1E2235`; communication and activity icons use the blue / teal light tints.
- Middle panel: KPI strip (monthly revenue, approval amount, last balance), carded sales pitch with blue accent edge, tinted activity icons.
- Account initials sit in a clean ~29px amber circle. Lead rows have no initial circles.
- Message threads use iOS-style bubbles with corner timestamps and read receipts.
- Communications still has All / Messages / Calls / Contacts / Email.
- Panel widths stay draggable, saved locally under `forge.react.v16.panel.*`, and resettable from Settings.
- UI settings persist under `forge-crm-ui-settings-v16`.

## Calling
The CRM does not embed a softphone. A call action hands the number to the host
environment instead:

1. `window.ForgeTelephonyAdapter.startCall({ number, leadId })` when a native
   shell (Electron / mobile) has installed an adapter.
2. Otherwise a cancelable `forge:call-request` CustomEvent is dispatched on
   `window`; a listener calls `preventDefault()` to claim it.

When nothing handles the request the CRM shows "Connect a phone or calling
provider to place calls." It never navigates the app to a `tel:` URL.

## Downloads
The right column is an iPhone: status bar, iOS pages, and a home indicator.

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
