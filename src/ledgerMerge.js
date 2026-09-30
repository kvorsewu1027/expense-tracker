const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right)

export function ledgerDataAreEqual(left, right) {
  return equal(left.expenses, right.expenses) && equal(left.budgetsByMonth, right.budgetsByMonth)
}

// Apply only this device's changes since its last acknowledged snapshot.
export function mergeLedgerChanges(base, local, remote) {
  const mergeMap = (before, after, latest) => {
    const result = { ...latest }
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (equal(before[key], after[key])) continue
      if (after[key] === undefined) delete result[key]
      else result[key] = after[key]
    }
    return result
  }
  const byId = (expenses) => Object.fromEntries(expenses.map((item) => [item.id, item]))
  return {
    expenses: Object.values(mergeMap(byId(base.expenses), byId(local.expenses), byId(remote.expenses))),
    budgetsByMonth: mergeMap(base.budgetsByMonth, local.budgetsByMonth, remote.budgetsByMonth),
    selectedMonth: local.selectedMonth,
  }
}

export function mergeImportedLedger(current, imported) {
  const expenses = new Map(current.expenses.map((item) => [item.id, item]))
  for (const item of imported.expenses) expenses.set(item.id, item)
  return {
    expenses: [...expenses.values()],
    budgetsByMonth: { ...current.budgetsByMonth, ...imported.budgetsByMonth },
    selectedMonth: imported.selectedMonth,
  }
}
