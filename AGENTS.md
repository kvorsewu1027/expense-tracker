# AGENTS Guidelines for expense-tracker

A private expense tracker only for tracking Liang-Shin & Chu-Hsuan's common expense. 
It is meant for tracking the monthly common expense from the joint account. 

## Product Preference

- Keep the app focused on Liang-Shin & Chu-Hsuan's shared monthly expenses from the joint account.
- Prefer simple, private, household-ledger features over broad personal-finance, banking, investment, or multi-user account-management features unless explicitly requested.
- Preserve the monthly workflow: choose a month, review category totals, add or edit expenses, maintain the month budget, and export/import ledger data when needed.

## Global Structure

- `src/main.jsx` mounts the React app and registers the production service worker.
- `src/App.jsx` contains the core expense-tracker workflow: state loading/sanitizing, localStorage persistence, optional remote ledger sync, CSV/JSON import and export, budget handling, expense CRUD, category summaries, and modal UI.
- `src/App.css` and `src/index.css` define the responsive application shell, sidebar, dashboard, forms, modals, and mobile behavior.
- `public/manifest.webmanifest`, `public/sw.js`, and `public/icons/` provide the PWA install experience and offline app shell for the GitHub Pages deployment.
- `vite.config.js` sets the Vite React build and the `/expense-tracker/` base path used by deployment.
- `README.md` documents setup, scripts, PWA installation, Firebase-style shared ledger sync, and import/export behavior.

## Development Workflow

- Use `npm run dev` for local development, `npm run lint` for lint checks, and `npm run build` before deploy-oriented changes.
- The deployed app is built with `npm run build` and published with `npm run deploy` through `gh-pages`.
- Expense data defaults to browser localStorage; shared laptop/phone sync only happens when `VITE_LEDGER_SYNC_URL` or a saved/shared ledger URL is configured.
- CSV export/import is the main backup and transfer path, so changes to ledger shape should preserve compatibility where practical.
