# NorthVector CRM

Three-panel CRM workspace — Leads, Company, and Communications — converted from the approved NorthVector HTML build to a clean React + TypeScript app.

## Stack

- Vite + React 19 + TypeScript, plain CSS design system (`src/index.css`)
- Mock data lives in `src/data/`; pure logic in `src/lib/`; app state in `src/state/CrmContext.tsx`; UI in `src/components/`

## Commands

- `npm run dev` — start the dev server
- `npm run build` — production build to `dist/`
- `npm test` — unit tests (node:test via tsx)
- `npm run lint` — type-check
- `npm run verify` — lint + tests + build
