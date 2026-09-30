import { mergeImportedLedger, mergeLedgerChanges, ledgerDataAreEqual } from './ledgerMerge.js'
import { getBudgetDraft, readLedgerSnapshot, writeLedgerSnapshot, initialSyncBaseline } from './ledgerPersistence.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
const expense = (id, amount = 10) => ({ id, amount })
const state = (expenses, budgetsByMonth = {}) => ({ expenses, budgetsByMonth, selectedMonth: '2026-08' })
const base = state([expense('july'), expense('august')], { '2026-07': 100 })
const imported = state([expense('august', 20)], { '2026-08': 200 })
const merged = mergeImportedLedger(base, imported)
assert(merged.expenses.length === 2 && merged.expenses[0].id === 'july', 'Import must preserve other months')
assert(mergeImportedLedger(merged, imported).expenses.length === 2, 'Repeated imports must not duplicate IDs')
assert(merged.budgetsByMonth['2026-07'] === 100, 'Import must preserve other budgets')
const remote = state([...base.expenses, expense('september')], { ...base.budgetsByMonth, '2026-09': 300 })
const edited = state([expense('august', 25)], { '2026-07': 150 })
const result = mergeLedgerChanges(base, edited, remote)
assert(!result.expenses.some((item) => item.id === 'july'), 'Explicit local deletion must persist')
assert(result.expenses.some((item) => item.id === 'september'), 'Concurrent remote additions must survive')
assert(result.budgetsByMonth['2026-09'] === 300, 'Concurrent remote budgets must survive')
assert(result.expenses.find((item) => item.id === 'august').amount === 25, 'Local edit must persist')
assert(!mergeLedgerChanges(base, base, state([])).expenses.length, 'Remote deletions must not be resurrected')
const inFlight = mergeLedgerChanges(edited, state([...edited.expenses, expense('new')]), result)
assert(inFlight.expenses.some((item) => item.id === 'new'), 'Edits made during a request must survive')

// Reproduce an import before the first successful read, followed by a failed
// request, retry, and a browser reload before the pending import is saved.
const storage = new Map()
const localStorage = { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) }
const empty = state([])
const pendingImport = mergeImportedLedger(empty, state([expense('offline-import')]))
writeLedgerSnapshot(localStorage, 'ledger', 'database-a', pendingImport, empty)
const reloaded = readLedgerSnapshot(localStorage, 'ledger', 'database-a', empty)
for (let retry = 0; retry < 3; retry += 1) {
  const retryResult = mergeLedgerChanges(reloaded.baseline, reloaded.state, remote)
  assert(retryResult.expenses.some((item) => item.id === 'offline-import'), 'Pending import must survive retries and reload')
  assert(retryResult.expenses.some((item) => item.id === 'september'), 'Retry must preserve remote records')
}
const acknowledged = mergeLedgerChanges(empty, pendingImport, remote)
const duringSave = mergeImportedLedger(acknowledged, state([expense('second-import')]))
writeLedgerSnapshot(localStorage, 'ledger', 'database-a', duringSave, acknowledged)
const afterSaveReload = readLedgerSnapshot(localStorage, 'ledger', 'database-a', empty)
assert(mergeLedgerChanges(afterSaveReload.baseline, afterSaveReload.state, acknowledged).expenses.some((item) => item.id === 'second-import'), 'In-flight import must remain pending after acknowledgment and reload')
assert(readLedgerSnapshot(localStorage, 'ledger', 'database-b', empty).baseline === null, 'Baseline must be scoped to the configured database')
localStorage.setItem('legacy', JSON.stringify(base))
assert(readLedgerSnapshot(localStorage, 'legacy', 'database-a', empty).state.expenses.length === 2, 'Existing local storage must remain readable')

const budgeted = state([expense('existing')], { '2026-08': 2500 })
const expensesOnlyImport = mergeImportedLedger(budgeted, state([expense('imported')]))
const draft = getBudgetDraft(expensesOnlyImport)
assert(draft === '2500', 'Expense-only import must retain the existing budget draft')
assert(Number(draft) === expensesOnlyImport.budgetsByMonth['2026-08'], 'Saving the preserved draft must not delete the budget')
assert(getBudgetDraft(state([], { '2026-08': 0 })) === '0', 'A zero budget must remain editable')

const legacySnapshot = readLedgerSnapshot(localStorage, 'legacy', 'database-a', empty)
const migrationBase = initialSyncBaseline(legacySnapshot)
const newerRemote = state([expense('july', 99)])
const migrated = mergeLedgerChanges(migrationBase, legacySnapshot.state, newerRemote)
assert(migrated.expenses.find((item) => item.id === 'july').amount === 99, 'Migration must preserve newer remote edits')
assert(!migrated.expenses.some((item) => item.id === 'august'), 'Migration must not resurrect remote deletions')
const importedDuringMigration = mergeImportedLedger(legacySnapshot.state, state([expense('restored-june')]))
writeLedgerSnapshot(localStorage, 'migrating', 'database-a', importedDuringMigration, migrationBase)
const migrationReload = readLedgerSnapshot(localStorage, 'migrating', 'database-a', empty)
assert(mergeLedgerChanges(initialSyncBaseline(migrationReload), migrationReload.state, newerRemote).expenses.some((item) => item.id === 'restored-june'), 'Imports after migration initialization must survive reload')
const deviceA = { ...newerRemote, selectedMonth: '2026-06' }
const deviceB = { ...newerRemote, selectedMonth: '2026-07' }
assert(ledgerDataAreEqual(deviceA, deviceB), 'Different selected months must not require a write')
assert(ledgerDataAreEqual(mergeLedgerChanges(deviceA, deviceA, deviceB), deviceB), 'Polling a different month must not require a write')
assert(mergeLedgerChanges(deviceA, deviceA, deviceB).selectedMonth === '2026-06', 'Polling must preserve local month navigation')
assert(!ledgerDataAreEqual(newerRemote, state([expense('july', 100)])), 'Expense changes must still require a write')
