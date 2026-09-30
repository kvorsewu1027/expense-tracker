export function readLedgerSnapshot(storage, key, syncUrl, fallback) {
  const saved = JSON.parse(storage.getItem(key) || 'null')
  return {
    state: saved?.state || saved || fallback,
    baseline: saved?.syncUrl === syncUrl ? saved.syncBaseline || null : null,
  }
}

// Unknown legacy data is a recovery copy, not evidence of pending edits.
// Freeze it as the baseline so only subsequent user changes are uploaded.
export function initialSyncBaseline(snapshot) {
  return snapshot.baseline || snapshot.state
}

// Store the local state and acknowledged baseline together so a reload cannot
// pair pending changes with a baseline that already includes those changes.
export function writeLedgerSnapshot(storage, key, syncUrl, state, baseline) {
  storage.setItem(key, JSON.stringify({ state, syncUrl, syncBaseline: baseline }))
}

export function getBudgetDraft(state) {
  const budget = state.budgetsByMonth[state.selectedMonth]
  return budget === undefined ? '' : String(budget)
}
