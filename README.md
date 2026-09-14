# ReactCRM-016 · Dashboard Visuals

Clean React/Vite source. Build 0.16 restyles 0.15 to the dashboard design system without changing CRM data, lead content, or business logic.

## Current build
- Inter throughout, including all revenue and financial figures.
- Dashboard tokens: canvas `#F2F4F8`, surfaces `#FFFFFF`, wells `#F7F8FC`, navy `#1E2235`, accents blue / teal / amber / navy.
- Stat-box treatment on detail cards: 1px `#E2E6F0` border, 9px radius, 13×16 padding, small shadow.
- Panel headers follow the dashboard title + count-pill / section-label layout.
- Navigation defaults to the dashboard navy `#1E2235`; communication and activity icons use the blue / teal / amber light tints.
- Middle panel: KPI strip (monthly revenue, requested, offer on file, current balance) with accent bars, position pill, carded sales pitch with blue accent edge, tinted activity icons.
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
