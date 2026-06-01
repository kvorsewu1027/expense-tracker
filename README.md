# Chu & Liang's Expense Tracker

Chu & Liang's Expense Tracker is a monthly expense tracker rewritten in React with Vite.

## Features

- Add expenses with amount, date, category, payment method, and note
- Review spending by month
- See total spend, daily average, top category, and transaction count
- Set a monthly budget and compare it against real spending
- Import and export CSV data
- Use one responsive UI on laptop and phone
- Sync one shared ledger across laptop and phone when a remote ledger URL is configured

## Scripts

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

## Git setup

The project includes `.gitignore` and `.gitattributes` so it is ready for version control.

If Git is installed on your machine, run:

```powershell
git init
git add .
git commit -m "Initial React expense tracker"
```

## Shared ledger sync

By default, Chu & Liang's Expense Tracker still saves to the browser so it works offline during development. To make the deployed app use the same ledger on laptop and phone, configure a Firebase Realtime Database URL:

1. Create a Firebase project and enable Realtime Database.
2. Create one ledger path, for example `ledgers/main`.
3. Add this to `.env.local` before running `npm run deploy`:

```powershell
VITE_LEDGER_SYNC_URL=https://your-project-id-default-rtdb.europe-west1.firebasedatabase.app/ledgers/main
```

The app adds `.json` automatically for Firebase's REST API. For a personal ledger without sign-in, the database rules must allow reads and writes to that path. Keep the database URL private, or add Firebase auth before using this for sensitive shared data.

## Import and export

The Settings panel exports a `.csv` file with expense rows and budget rows. Importing a file replaces the current ledger with the file contents. CSV files with common expense headers such as `name`, `amount`, `date`, `category`, `payment`, and `note` can be imported, and older Ledger Bloom `.json` exports are still accepted for compatibility.
