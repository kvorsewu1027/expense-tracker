---
name: expense-tracker-release
description: Repo-specific release workflow for this expense tracker. Use when the user asks to commit current changes, push a branch, create or update a GitHub pull request with a change-summary comment using non-browser GitHub CLI, MCP, or API paths, deploy the app to GitHub Pages, or merge one of these release PRs with a descriptive merge commit.
---

# Expense Tracker Release

Use this skill for this repository's recurring GitHub workflow:

- Commit current local changes.
- Push a release branch.
- Create a GitHub PR with a useful description and conversation comment without using the browser by default.
- Deploy the built Vite app to GitHub Pages.
- Merge a PR into `main` with a descriptive merge commit.

## Repository Facts

- Repo root: `C:\Users\josep\Documents\Codex\expense-tracker`
- GitHub repo: `kvorsewu1027/expense-tracker`
- Base branch: `main`
- GitHub Pages URL: `https://kvorsewu1027.github.io/expense-tracker/`
- Vite base path: `/expense-tracker/`
- Package manager command on Windows: use `npm.cmd`, because PowerShell may block `npm.ps1`.

## Safety Rules

- Run `git status --short --branch` before changing git state.
- Inspect `git diff --stat` and relevant diffs before staging.
- Stage only files that belong to the requested release.
- Use `codex/<short-description>` branch names when creating a new branch from `main`.
- If there is an existing release PR branch and the user asks to repeat the workflow, continue that branch only when the local context clearly belongs to it; otherwise create a new `codex/` branch.
- Do not merge a PR unless the user explicitly asks to merge it.
- Use network escalation for `git fetch`, `git push`, `gh`, GitHub MCP/API writes, `gh-pages` publish, and remote verification.
- Do not use browser automation for PR creation or comments unless the user explicitly asks for browser use or every non-browser path is unavailable.

## Commit, PR, Push, Comment

1. Check state:

```powershell
git status --short --branch
git diff --stat
```

2. Inspect changed files enough to summarize the change:

```powershell
git diff -- <files>
Get-ChildItem -Recurse <new-folder>
Get-Content <new-text-file>
```

3. If currently on `main`, create a branch:

```powershell
git switch -c codex/<short-description>
```

4. Validate before committing:

```powershell
npm.cmd run lint
npm.cmd run build
```

5. Stage explicit files and commit with a terse imperative message:

```powershell
git add <files>
git commit -m "<commit summary>"
git push -u origin <branch>
```

6. Create the PR without browser use.

Use this order:

### Option A: GitHub CLI

Use this when `gh` is installed and authenticated:

```powershell
gh --version
gh auth status
gh pr create --repo kvorsewu1027/expense-tracker --base main --head <branch> --title "<title>" --body-file <body-file>
```

Create the body file in a temp or repo-local scratch path only when needed; do not commit it. The PR body should include Summary, Changes, and Validation sections.

### Option B: GitHub MCP connector

Use `tool_search` to expose GitHub PR tools if they are not already available. Prefer:

- `_create_pull_request` with `repository_full_name: "kvorsewu1027/expense-tracker"`, `base: "main"`, `head: "<branch>"`, `title`, `body`, and `draft: false`.
- `_add_comment_to_issue` for PR conversation comments.

If the connector returns `403 Resource not accessible by integration`, immediately try CLI or REST API instead of browser automation.

### Option C: GitHub REST API

Use this when a token is available in `GITHUB_TOKEN` or `GH_TOKEN`. Never print the token.

Create PR:

```powershell
$token = if ($env:GITHUB_TOKEN) { $env:GITHUB_TOKEN } else { $env:GH_TOKEN }
$body = @{
  title = "<title>"
  head = "<branch>"
  base = "main"
  body = "<markdown body>"
  draft = $false
} | ConvertTo-Json
Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.github.com/repos/kvorsewu1027/expense-tracker/pulls" `
  -Headers @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json"; "X-GitHub-Api-Version" = "2022-11-28" } `
  -Body $body `
  -ContentType "application/json"
```

Add PR comment:

```powershell
$commentBody = @{ body = "<markdown comment>" } | ConvertTo-Json
Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.github.com/repos/kvorsewu1027/expense-tracker/issues/<pr-number>/comments" `
  -Headers @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json"; "X-GitHub-Api-Version" = "2022-11-28" } `
  -Body $commentBody `
  -ContentType "application/json"
```

Only use browser PR creation as a last resort after telling the user which non-browser methods were unavailable.

7. Add a PR conversation comment when requested or when repeating an existing PR workflow.

Use the same non-browser order: `gh pr comment`, GitHub MCP `_add_comment_to_issue`, then GitHub REST issue comments.

Use a compact comment:

```markdown
Pushed in `<sha>`.

Change summary:

- ...

Validation:

- `npm.cmd run lint`
- `npm.cmd run build`
```

With `gh`:

```powershell
gh pr comment <pr-number-or-url> --body-file <comment-file>
```

If all non-browser comment paths fail, report the blocker and give the exact comment text rather than silently switching to the browser.

## Deploy GitHub Pages

Deploy from the branch that contains the intended current app state.

1. Build:

```powershell
npm.cmd run build
```

2. Clear stale `gh-pages` package cache and publish:

```powershell
node node_modules\gh-pages\bin\gh-pages-clean.js
node node_modules\gh-pages\bin\gh-pages.js -d dist -r https://github.com/kvorsewu1027/expense-tracker.git
```

3. Verify:

```powershell
git ls-remote --heads origin gh-pages
curl.exe -L https://raw.githubusercontent.com/kvorsewu1027/expense-tracker/gh-pages/index.html
curl.exe -I https://kvorsewu1027.github.io/expense-tracker/
```

If the deployed app includes PWA changes, also verify:

```powershell
curl.exe -L https://raw.githubusercontent.com/kvorsewu1027/expense-tracker/gh-pages/manifest.webmanifest
```

Report the `gh-pages` commit SHA, asset hashes from deployed HTML, and HTTP status.

## Merge PR

When the user asks to merge a PR with descriptive comments:

1. Fetch and ensure the PR branch is present:

```powershell
git fetch origin
```

2. Switch to `main`:

```powershell
git switch main
```

3. Merge with a descriptive no-fast-forward commit:

```powershell
git merge --no-ff <branch> `
  -m "<descriptive merge title>" `
  -m "<one-sentence purpose>" `
  -m "<what changed>" `
  -m "Validated with npm.cmd run lint and npm.cmd run build before deployment."
```

4. Push:

```powershell
git push origin main
```

5. Verify the GitHub PR page shows `Merged`.

Use the local merge flow when GitHub's browser merge-message fields resist automation. It preserves a descriptive merge commit body and reliably marks the PR as merged once `main` is pushed.

## Final Response

Keep the final response short. Include:

- Branch and commit SHA.
- PR URL and whether a PR comment was added.
- Validation commands.
- Deployment URL and verification details when deployed.
- Merge commit SHA when merged.

Emit Codex git directives only for actions that actually succeeded.
