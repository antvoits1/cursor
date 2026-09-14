# ReactCRM-016 · Dashboard Visuals

Clean React/Vite source. Build 0.16 restyles 0.15 to the dashboard design system without changing CRM data, lead content, or business logic.

## Current build
- Inter for the interface; JetBrains Mono only for lead revenue figures.
- Dashboard tokens: canvas `#F2F4F8`, surfaces `#FFFFFF`, wells `#F7F8FC`, navy `#1E2235`, accents blue / teal / amber / navy.
- Stat-box treatment on detail cards: 1px `#E2E6F0` border, 9px radius, 13×16 padding, small shadow.
- Panel headers follow the dashboard title + count-pill / section-label layout.
- Account initials are a 15px blue chip. Lead rows have no initial circles.
- Internal dialer remains absent. Calls still use `ForgeTelephonyAdapter` or `forge:call-request`.
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
