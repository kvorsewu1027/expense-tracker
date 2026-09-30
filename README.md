# Chu & Liang's Expense Tracker

Chu & Liang's Expense Tracker is a monthly expense tracker written in React with Vite.

## Features

- Add expenses with amount, date, category, payment method, and note
- Review spending by month
- See total spend, daily average, top category, and transaction count
- Set a monthly budget and compare it against real spending
- Import and export CSV data
- Use one responsive UI on laptop and phone
- Sign in with one of two approved household accounts
- Sync one protected shared ledger across laptop and phone when Firebase is configured

## Scripts

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

## Phone app install

The app is configured as a Progressive Web App, so the same deployed website can be installed on a phone without Xcode or an app store.

- Android: open the deployed app in Chrome and choose "Install app" or "Add to Home screen".
- iPhone: open the deployed app in Safari, choose Share, then choose "Add to Home Screen".

The PWA uses the custom app icons in `public/icons`.

## Git setup

The project includes `.gitignore` and `.gitattributes` so it is ready for version control.

If Git is installed on your machine, run:

```powershell
git init
git add .
git commit -m "Initial React expense tracker"
```

## Shared ledger sync

By default, Chu & Liang's Expense Tracker still saves to the browser so it works offline during development. That means a laptop and phone will not share expenses until both are pointed at the same shared ledger. To make the deployed app use the same ledger on both devices, configure a Firebase Realtime Database URL:

1. Create a Firebase project and enable Realtime Database.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. In **Authentication → Users**, manually create accounts for Liang-Shin and Chu-Hsuan. Do not add public registration to the app.
4. Copy the UID shown for each user.
5. In **Authentication → Settings → Authorized domains**, add `kvorsewu1027.github.io`. Add `localhost` too only when local Firebase sign-in testing is needed.
6. In **Project settings → Your apps**, create or select a Web app and copy its web configuration values.
7. Copy `.env.example` to `.env.local` and fill in every value:

```powershell
VITE_LEDGER_SYNC_URL=https://your-project-id-default-rtdb.europe-west1.firebasedatabase.app/expenseTracker/main
VITE_FIREBASE_API_KEY=your-firebase-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_ALLOWED_UIDS=liang-shin-firebase-uid,chu-hsuan-firebase-uid
VITE_FIREBASE_DISPLAY_NAMES=liang-shin-firebase-uid:Liang-Shin,chu-hsuan-firebase-uid:Chu-Hsuan
```

The Firebase web API key and user UIDs are public identifiers, not secrets. Never place a service-account key or database secret in a `VITE_` variable.

On each approved user's next successful login, the app applies the configured display name to their Firebase Authentication profile. Settings and the app header then show the display name instead of the email address.

The app adds `.json` automatically for Firebase's REST API and attaches the signed-in user's short-lived Firebase ID token to each request. When Firebase is configured, the ledger remains hidden until an approved user signs in. The client-side UID allowlist improves the UI, while Realtime Database Rules provide the actual security boundary.

The sign-in screen keeps users signed in across browser restarts by default. Clearing **Keep me signed in on this device** limits the session to the current browser session. Firebase stores the session token; the app never stores the user's password.

The shared database URL is deployment configuration and is not editable in the app. Settings shows only the signed-in account and current sync status, so every authenticated device uses the same `VITE_LEDGER_SYNC_URL` automatically.

### Realtime Database rules

Before using shared sync, verify that `database.rules.json` contains the same two approved Firebase UIDs, and publish the file in **Realtime Database → Rules**. The included rules deny all other reads and writes and only grant both approved users access to `expenseTracker/main`.

If the Firebase CLI is installed and the project has been selected, the same rules can be deployed with:

```powershell
firebase deploy --only database
```

Back up the current ledger before tightening the rules. Deploy the authentication-capable app, verify that both users can sign in, and then publish the restrictive rules so the existing anonymous sync is not locked out prematurely.

## Import and export

The Settings panel exports a `.csv` file with expense rows and budget rows. Importing merges expenses by ID and updates included budgets, preserving other months. Reimporting the same IDs updates records without duplicates. Rows without IDs receive new IDs on each import. CSV files with common expense headers such as `name`, `amount`, `date`, `category`, `payment`, and `note` can be imported, and older Ledger Bloom `.json` exports are still accepted for compatibility.

Shared sync uses Firebase ETags and conditional writes to retry concurrent changes safely. Unrelated changes are merged against the last acknowledged snapshot; simultaneous edits to the same record use the last successful writer. Before imports and remote replacements, ten recovery snapshots are retained in browser localStorage under `ledger-bloom-react-state-backups`. Downloaded backups remain necessary.

Settings also offers **Back up all months**, which downloads a JSON file that can be imported to merge its records back into the ledger. **Download recovery snapshots** downloads the local snapshot history; extract a snapshot's `state` object into a separate JSON file before importing it.

For independent daily backups, Firebase Realtime Database supports automated backups on the Blaze plan through the console's Backups tab: https://firebase.google.com/docs/database/backups. Keep downloaded all-month JSON backups as well, especially on the free Spark plan. Browser snapshots disappear when site data is cleared. Backups enabled now cannot recover data already deleted before the first backup.

On first migration from legacy local storage, the existing local ledger becomes the baseline and is retained in recovery snapshots before remote reconciliation. It is not automatically uploaded over newer remote data; import a backup explicitly to restore missing records. Changes and imports made after initialization remain pending across retries and reloads. Selected month is a device preference and does not trigger shared database writes.
