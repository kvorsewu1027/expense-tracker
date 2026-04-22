# Ledger Bloom

Ledger Bloom is a monthly expense tracker rewritten in React with Vite.

## Features

- Add expenses with amount, date, category, payment method, and note
- Review spending by month
- See total spend, daily average, top category, and transaction count
- Set a monthly budget and compare it against real spending
- Import and export JSON data
- Use one responsive UI on laptop and phone

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

## Note about sync

This version stores data in the browser. It works well on both laptop and phone, but it does not sync the same expense data between devices yet.
