import { useEffect, useRef, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'ledger-bloom-react-state'
const REMOTE_SYNC_URL = normalizeSyncUrl(import.meta.env.VITE_LEDGER_SYNC_URL)
const SYNC_POLL_INTERVAL_MS = 10000
const CSV_COLUMNS = [
  'type',
  'id',
  'name',
  'amount',
  'date',
  'category',
  'payment',
  'note',
  'month',
  'budget',
  'selectedMonth',
]
const CATEGORIES = [
  'Rent',
  'Grocery',
  'Entertainment',
  'Subscription',
  'Others',
  'Transport',
]
const CATEGORY_ALIASES = {
  Housing: 'Rent',
  Groceries: 'Grocery',
  Other: 'Others',
}
const DEFAULT_CATEGORY = 'Grocery'
const PAYMENTS = ['Card', 'Cash']

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
})

function createDefaultFormState() {
  return {
    name: '',
    amount: '',
    date: toDateInputValue(new Date()),
    category: DEFAULT_CATEGORY,
    payment: PAYMENTS[0],
    note: '',
  }
}

function createDefaultTrackerState() {
  return {
    expenses: [],
    budgetsByMonth: {},
    selectedMonth: toMonthKey(new Date()),
  }
}

function loadInitialState() {
  try {
    const savedState = window.localStorage.getItem(STORAGE_KEY)
    if (!savedState) {
      return createDefaultTrackerState()
    }

    return sanitizeState(JSON.parse(savedState))
  } catch (error) {
    console.error('Unable to load saved data.', error)
    return createDefaultTrackerState()
  }
}

function sanitizeState(source) {
  const safeExpenses = Array.isArray(source?.expenses)
    ? source.expenses
        .map((expense) => ({
          id: typeof expense?.id === 'string' ? expense.id : crypto.randomUUID(),
          name: typeof expense?.name === 'string' ? expense.name : '',
          amount: roundCurrency(Number(expense?.amount || 0)),
          date: typeof expense?.date === 'string' ? expense.date : '',
          category: normalizeCategory(expense?.category),
          payment:
            typeof expense?.payment === 'string' && PAYMENTS.includes(expense.payment)
              ? expense.payment
              : PAYMENTS[0],
          note: typeof expense?.note === 'string' ? expense.note : '',
        }))
        .filter(
          (expense) =>
            expense.name &&
            expense.date &&
            Number.isFinite(expense.amount) &&
            expense.amount > 0
        )
    : []

  const safeBudgets =
    source?.budgetsByMonth && typeof source.budgetsByMonth === 'object'
      ? Object.fromEntries(
          Object.entries(source.budgetsByMonth).filter(
            ([month, amount]) =>
              typeof month === 'string' &&
              /^\d{4}-\d{2}$/.test(month) &&
              Number.isFinite(Number(amount)) &&
              Number(amount) >= 0
          )
        )
      : {}

  return {
    expenses: safeExpenses,
    budgetsByMonth: safeBudgets,
    selectedMonth:
      typeof source?.selectedMonth === 'string' &&
      /^\d{4}-\d{2}$/.test(source.selectedMonth)
        ? source.selectedMonth
        : toMonthKey(new Date()),
  }
}

function normalizeSyncUrl(value) {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return ''
  }

  return trimmedValue.endsWith('.json') ? trimmedValue : `${trimmedValue}.json`
}

async function fetchSharedLedger() {
  const response = await fetch(REMOTE_SYNC_URL, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Shared ledger load failed with ${response.status}`)
  }

  const payload = await response.json()
  if (!payload) {
    return null
  }

  return sanitizeState(payload.state || payload)
}

async function saveSharedLedger(state) {
  const response = await fetch(REMOTE_SYNC_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      savedAt: new Date().toISOString(),
      state: sanitizeState(state),
    }),
  })

  if (!response.ok) {
    throw new Error(`Shared ledger save failed with ${response.status}`)
  }
}

function statesAreEqual(left, right) {
  return JSON.stringify(sanitizeState(left)) === JSON.stringify(sanitizeState(right))
}

function trackerStateToCsv(state) {
  const sanitizedState = sanitizeState(state)
  const rows = [CSV_COLUMNS]

  sanitizedState.expenses.forEach((expense) => {
    rows.push([
      'expense',
      expense.id,
      expense.name,
      String(expense.amount),
      expense.date,
      expense.category,
      expense.payment,
      expense.note,
      '',
      '',
      sanitizedState.selectedMonth,
    ])
  })

  Object.entries(sanitizedState.budgetsByMonth).forEach(([month, budget]) => {
    rows.push([
      'budget',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      month,
      String(budget),
      sanitizedState.selectedMonth,
    ])
  })

  if (rows.length === 1) {
    rows.push(['meta', '', '', '', '', '', '', '', '', '', sanitizedState.selectedMonth])
  }

  return rows.map((row) => row.map(formatCsvCell).join(',')).join('\r\n')
}

function csvToTrackerState(csvText) {
  const rows = parseCsvRows(csvText)
  if (rows.length < 2) {
    throw new Error('CSV has no importable rows')
  }

  const headers = rows[0].map((header) => normalizeCsvHeader(header))
  const records = rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] || '']))
  )
  const expenses = []
  const budgetsByMonth = {}
  let selectedMonth = ''

  records.forEach((record) => {
    const recordType = normalizeCsvHeader(record.type)
    const rowSelectedMonth = record.selectedmonth || record.selected_month
    if (!selectedMonth && /^\d{4}-\d{2}$/.test(rowSelectedMonth)) {
      selectedMonth = rowSelectedMonth
    }

    if (!recordType || recordType === 'expense') {
      expenses.push({
        id: record.id || crypto.randomUUID(),
        name: record.name || record.expense || record.description,
        amount: record.amount,
        date: record.date,
        category: record.category,
        payment: record.payment || record.paymentmethod || record.payment_method,
        note: record.note || record.notes,
      })
      return
    }

    if (recordType === 'budget') {
      const month = record.month || rowSelectedMonth
      const budget = Number(record.budget || record.amount)
      if (/^\d{4}-\d{2}$/.test(month) && Number.isFinite(budget) && budget >= 0) {
        budgetsByMonth[month] = roundCurrency(budget)
      }
    }
  })

  const firstExpenseMonth = expenses.find((expense) => /^\d{4}-\d{2}/.test(expense.date))?.date.slice(0, 7)
  const firstBudgetMonth = Object.keys(budgetsByMonth)[0]

  return sanitizeState({
    expenses,
    budgetsByMonth,
    selectedMonth: selectedMonth || firstExpenseMonth || firstBudgetMonth || toMonthKey(new Date()),
  })
}

function importTextToTrackerState(importText, fileName = '') {
  const trimmedText = importText.trim()
  const lowerFileName = fileName.toLowerCase()

  if (lowerFileName.endsWith('.json') || trimmedText.startsWith('{')) {
    return sanitizeState(JSON.parse(trimmedText || '{}'))
  }

  return csvToTrackerState(importText)
}

function parseCsvRows(csvText) {
  const rows = []
  let currentRow = []
  let currentCell = ''
  let isInsideQuotedCell = false

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]
    const nextCharacter = csvText[index + 1]

    if (character === '"') {
      if (isInsideQuotedCell && nextCharacter === '"') {
        currentCell += '"'
        index += 1
      } else {
        isInsideQuotedCell = !isInsideQuotedCell
      }
      continue
    }

    if (character === ',' && !isInsideQuotedCell) {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !isInsideQuotedCell) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }
      currentRow.push(currentCell)
      if (currentRow.some((cell) => cell.trim())) {
        rows.push(currentRow)
      }
      currentRow = []
      currentCell = ''
      continue
    }

    currentCell += character
  }

  currentRow.push(currentCell)
  if (currentRow.some((cell) => cell.trim())) {
    rows.push(currentRow)
  }

  return rows
}

function formatCsvCell(value) {
  const textValue = String(value ?? '')
  if (/[",\r\n]/.test(textValue)) {
    return `"${textValue.replace(/"/g, '""')}"`
  }

  return textValue
}

function normalizeCsvHeader(value) {
  return String(value || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function App() {
  const [trackerState, setTrackerState] = useState(loadInitialState)
  const [formState, setFormState] = useState(createDefaultFormState)
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState(null)
  const [hasCompletedInitialSync, setHasCompletedInitialSync] = useState(!REMOTE_SYNC_URL)
  const [syncStatus, setSyncStatus] = useState(() => ({
    type: REMOTE_SYNC_URL ? 'loading' : 'local',
    message: REMOTE_SYNC_URL ? 'Connecting to shared ledger...' : 'Stored on this device',
  }))
  const latestStateRef = useRef(trackerState)
  const skipNextRemoteSaveRef = useRef(false)

  const { expenses, budgetsByMonth, selectedMonth } = trackerState
  const [budgetDraft, setBudgetDraft] = useState(() =>
    budgetsByMonth[selectedMonth] !== undefined ? String(budgetsByMonth[selectedMonth]) : ''
  )
  const expensesForMonth = expenses
    .filter((expense) => expense.date.startsWith(selectedMonth))
    .sort((left, right) => right.date.localeCompare(left.date))
  const totalSpent = sumExpenses(expensesForMonth)
  const groupedCategories = getCategoryGroups(expensesForMonth)
  const budget = Number(budgetsByMonth[selectedMonth] ?? 0)
  const budgetLeft = roundCurrency(budget - totalSpent)
  const amountCalculation = calculateAmountExpression(formState.amount)

  useEffect(() => {
    latestStateRef.current = trackerState
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trackerState))
  }, [trackerState])

  useEffect(() => {
    if (!REMOTE_SYNC_URL) {
      return undefined
    }

    let isCancelled = false

    async function loadSharedLedger() {
      try {
        const sharedState = await fetchSharedLedger()

        if (isCancelled) {
          return
        }

        if (sharedState) {
          skipNextRemoteSaveRef.current = true
          setTrackerState(sharedState)
          setSyncStatus({
            type: 'synced',
            message: `Shared ledger loaded ${formatSyncTime(new Date())}`,
          })
        } else {
          await saveSharedLedger(latestStateRef.current)
          if (!isCancelled) {
            setSyncStatus({
              type: 'synced',
              message: `Shared ledger created ${formatSyncTime(new Date())}`,
            })
          }
        }

        if (!isCancelled) {
          setHasCompletedInitialSync(true)
        }
      } catch (error) {
        console.error('Unable to load shared ledger.', error)
        if (!isCancelled) {
          setSyncStatus({
            type: 'error',
            message: 'Shared ledger unavailable. Changes are saved on this device.',
          })
        }
      }
    }

    loadSharedLedger()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!REMOTE_SYNC_URL || !hasCompletedInitialSync) {
      return undefined
    }

    if (skipNextRemoteSaveRef.current) {
      skipNextRemoteSaveRef.current = false
      return undefined
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setSyncStatus({
          type: 'saving',
          message: 'Saving to shared ledger...',
        })
        await saveSharedLedger(trackerState)
        setSyncStatus({
          type: 'synced',
          message: `Shared ledger saved ${formatSyncTime(new Date())}`,
        })
      } catch (error) {
        console.error('Unable to save shared ledger.', error)
        setSyncStatus({
          type: 'error',
          message: 'Shared save failed. This device still has your latest changes.',
        })
      }
    }, 450)

    return () => window.clearTimeout(timeoutId)
  }, [trackerState, hasCompletedInitialSync])

  useEffect(() => {
    if (!REMOTE_SYNC_URL || !hasCompletedInitialSync) {
      return undefined
    }

    const intervalId = window.setInterval(async () => {
      try {
        const sharedState = await fetchSharedLedger()
        if (!sharedState || statesAreEqual(sharedState, latestStateRef.current)) {
          return
        }

        skipNextRemoteSaveRef.current = true
        setTrackerState(sharedState)
        setSyncStatus({
          type: 'synced',
          message: `Shared ledger refreshed ${formatSyncTime(new Date())}`,
        })
      } catch (error) {
        console.error('Unable to refresh shared ledger.', error)
        setSyncStatus({
          type: 'error',
          message: 'Shared refresh failed. Retrying automatically.',
        })
      }
    }, SYNC_POLL_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [hasCompletedInitialSync])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeExpenseModal()
        setIsSettingsModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleFormChange(event) {
    const { name, value } = event.target
    setFormState((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    const resolvedAmount = calculateAmountExpression(formState.amount)
    const nextExpense = {
      id: crypto.randomUUID(),
      name: formState.name.trim(),
      amount: resolvedAmount.isValid ? resolvedAmount.value : Number.NaN,
      date: formState.date,
      category: formState.category,
      payment: formState.payment,
      note: formState.note.trim(),
    }

    if (
      !nextExpense.name ||
      !nextExpense.date ||
      !Number.isFinite(nextExpense.amount) ||
      nextExpense.amount <= 0
    ) {
      return
    }

    const nextMonth = nextExpense.date.slice(0, 7)

    setTrackerState((current) => {
      if (editingExpenseId) {
        return {
          ...current,
          expenses: current.expenses.map((expense) =>
            expense.id === editingExpenseId
              ? {
                  ...nextExpense,
                  id: editingExpenseId,
                }
              : expense
          ),
          selectedMonth: nextMonth,
        }
      }

      return {
        ...current,
        expenses: [nextExpense, ...current.expenses],
        selectedMonth: nextMonth,
      }
    })
    setBudgetDraft(
      budgetsByMonth[nextMonth] !== undefined ? String(budgetsByMonth[nextMonth]) : ''
    )
    setFormState(createDefaultFormState())
    setEditingExpenseId(null)
    setIsExpenseModalOpen(false)
  }

  function handleAmountOperator(operator) {
    setFormState((current) => {
      const amount = current.amount.trimEnd()
      if (!amount) {
        return current
      }

      const nextAmount = /[+*x×]$/.test(amount)
        ? `${amount.slice(0, -1)}${operator}`
        : `${amount}${operator}`

      return {
        ...current,
        amount: nextAmount,
      }
    })
  }

  function handleAmountApply() {
    if (!amountCalculation.isValid) {
      return
    }

    setFormState((current) => ({
      ...current,
      amount: String(amountCalculation.value),
    }))
  }

  function handleAmountClear() {
    setFormState((current) => ({
      ...current,
      amount: '',
    }))
  }

  function handleMonthChange(event) {
    const nextMonth = event.target.value || toMonthKey(new Date())
    setTrackerState((current) => ({
      ...current,
      selectedMonth: nextMonth,
    }))
    setBudgetDraft(
      budgetsByMonth[nextMonth] !== undefined ? String(budgetsByMonth[nextMonth]) : ''
    )
  }

  function handleBudgetSave() {
    const trimmedBudget = budgetDraft.trim()

    setTrackerState((current) => {
      const nextBudgets = { ...current.budgetsByMonth }

      if (!trimmedBudget) {
        delete nextBudgets[current.selectedMonth]
      } else {
        const numericBudget = Number(trimmedBudget)
        if (!Number.isFinite(numericBudget) || numericBudget < 0) {
          return current
        }

        nextBudgets[current.selectedMonth] = roundCurrency(numericBudget)
      }

      return {
        ...current,
        budgetsByMonth: nextBudgets,
      }
    })
    setIsSettingsModalOpen(false)
  }

  function openSettingsModal() {
    setBudgetDraft(
      budgetsByMonth[selectedMonth] !== undefined ? String(budgetsByMonth[selectedMonth]) : ''
    )
    setIsSettingsModalOpen(true)
  }

  function handleDelete(expenseId) {
    setTrackerState((current) => ({
      ...current,
      expenses: current.expenses.filter((expense) => expense.id !== expenseId),
    }))
  }

  function openNewExpenseModal() {
    setEditingExpenseId(null)
    setFormState(createDefaultFormState())
    setIsExpenseModalOpen(true)
  }

  function openEditExpenseModal(expense) {
    setEditingExpenseId(expense.id)
    setFormState({
      name: expense.name,
      amount: String(expense.amount),
      date: expense.date,
      category: expense.category,
      payment: expense.payment,
      note: expense.note,
    })
    setIsExpenseModalOpen(true)
  }

  function closeExpenseModal() {
    setEditingExpenseId(null)
    setFormState(createDefaultFormState())
    setIsExpenseModalOpen(false)
  }

  function handleExport() {
    const blob = new Blob([trackerStateToCsv(trackerState)], {
      type: 'text/csv;charset=utf-8',
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `chu-liang-expense-tracker-${selectedMonth}.csv`
    link.click()
    window.URL.revokeObjectURL(url)
  }

  function handleImport(event) {
    const [file] = event.target.files || []
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const importedState = importTextToTrackerState(
          String(reader.result || ''),
          file.name
        )
        setTrackerState(importedState)
        setBudgetDraft(
          importedState.budgetsByMonth[importedState.selectedMonth] !== undefined
            ? String(importedState.budgetsByMonth[importedState.selectedMonth])
            : ''
        )
      } catch (error) {
        console.error('Unable to import file.', error)
        window.alert(
          "That file could not be imported. Please choose a valid Chu & Liang's Expense Tracker CSV or JSON export."
        )
      } finally {
        event.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="brand-block">
          <span className="brand-mark">CL</span>
          <div>
            <h1>Chu & Liang's Expense Tracker</h1>
          </div>
        </div>

        <nav className="category-nav" aria-label="Expense categories">
          {groupedCategories.map(({ category, amount, count }) => (
            <a href={`#${toAnchorId(category)}`} key={category}>
              <span>{category}</span>
              <strong>{count ? formatCurrency(amount) : '-'}</strong>
            </a>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h2>Expense Board of {formatMonthLabel(selectedMonth)}</h2>
          </div>

          <div className="topbar-actions">
            <label className="month-picker">
              <span>Month</span>
              <input type="month" value={selectedMonth} onChange={handleMonthChange} />
            </label>
            <button className="secondary-button" type="button" onClick={openSettingsModal}>
              Settings
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={openNewExpenseModal}
            >
              New expense
            </button>
          </div>
        </header>

        <section className="metrics-row" aria-label="Monthly summary">
          <SummaryCard label="Total spent" value={formatCurrency(totalSpent)} />
          <SummaryCard label="Budget left" value={budget ? formatCurrency(budgetLeft) : 'Not set'} />
        </section>

        <section className="category-board" aria-label="Expenses by category">
          {groupedCategories.map(({ category, amount, expenses: categoryExpenses }) => (
            <article className="category-section" id={toAnchorId(category)} key={category}>
              <header className="category-section-header">
                <div>
                  <p className="section-label">{category}</p>
                  <h3>{formatCurrency(amount)}</h3>
                </div>
                <span>{categoryExpenses.length} items</span>
              </header>

              {categoryExpenses.length ? (
                <div className="expense-table" role="table" aria-label={`${category} expenses`}>
                  <div className="expense-row expense-row-head" role="row">
                    <span>Name</span>
                    <span>Date</span>
                    <span>Payment</span>
                    <span>Amount</span>
                    <span>Actions</span>
                  </div>
                  {categoryExpenses.map((expense) => (
                    <div className="expense-row" role="row" key={expense.id}>
                      <span className="expense-name" data-label="Name">
                        <strong>{expense.name}</strong>
                        {expense.note ? <small>{expense.note}</small> : null}
                      </span>
                      <span data-label="Date">{formatDate(expense.date)}</span>
                      <span data-label="Payment">{expense.payment}</span>
                      <span data-label="Amount">{formatCurrency(expense.amount)}</span>
                      <div className="expense-actions" data-label="Actions">
                        <button
                          className="ghost-button icon-action-button"
                          type="button"
                          onClick={() => openEditExpenseModal(expense)}
                          aria-label={`Edit ${expense.name}`}
                          title="Edit"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          className="delete-button icon-action-button"
                          type="button"
                          onClick={() => handleDelete(expense.id)}
                          aria-label={`Delete ${expense.name}`}
                          title="Delete"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v5" />
                            <path d="M14 11v5" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-category">No expenses yet</p>
              )}
            </article>
          ))}
        </section>
      </main>

      {isExpenseModalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeExpenseModal}>
          <section
            className="expense-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <p className="section-label">{editingExpenseId ? 'Edit record' : 'New record'}</p>
                <h2 id="expense-modal-title">
                  {editingExpenseId ? 'Edit expense' : 'Add expense'}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={closeExpenseModal}
                aria-label="Close expense dialog"
              >
                X
              </button>
            </header>

            <form className="expense-form" onSubmit={handleSubmit}>
              <label>
                <span>Expense name</span>
                <input
                  name="name"
                  type="text"
                  value={formState.name}
                  onChange={handleFormChange}
                  placeholder="Groceries, rent, train ticket..."
                  required
                />
              </label>

              <div className="field-row">
                <div className="amount-field">
                  <label htmlFor="expense-amount">
                    <span>Amount</span>
                  </label>
                  <input
                    id="expense-amount"
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    value={formState.amount}
                    onChange={handleFormChange}
                    placeholder="12.50 + 3 * 2"
                    required
                  />
                  <div className="amount-calculator" aria-label="Amount calculator">
                    <div className="amount-result" aria-live="polite">
                      {amountCalculation.isValid && formState.amount.trim() ? (
                        <>
                          <span>Result</span>
                          <strong>{formatCurrency(amountCalculation.value)}</strong>
                        </>
                      ) : (
                        <span>Use + or x to combine amounts</span>
                      )}
                    </div>
                    <div className="calculator-actions">
                      <button
                        className="calculator-button"
                        type="button"
                        onClick={() => handleAmountOperator('+')}
                        aria-label="Add another amount"
                        title="Add"
                      >
                        +
                      </button>
                      <button
                        className="calculator-button"
                        type="button"
                        onClick={() => handleAmountOperator('×')}
                        aria-label="Multiply by another amount"
                        title="Multiply"
                      >
                        ×
                      </button>
                      <button
                        className="calculator-button"
                        type="button"
                        onClick={handleAmountApply}
                        disabled={!amountCalculation.isValid || !formState.amount.trim()}
                        aria-label="Use calculated amount"
                        title="Use result"
                      >
                        =
                      </button>
                      <button
                        className="calculator-button"
                        type="button"
                        onClick={handleAmountClear}
                        aria-label="Clear amount"
                        title="Clear"
                      >
                        C
                      </button>
                    </div>
                  </div>
                </div>

                <label>
                  <span>Date</span>
                  <input
                    name="date"
                    type="date"
                    value={formState.date}
                    onChange={handleFormChange}
                    required
                  />
                </label>
              </div>

              <div className="field-row">
                <label>
                  <span>Category</span>
                  <select
                    name="category"
                    value={formState.category}
                    onChange={handleFormChange}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Payment</span>
                  <select
                    name="payment"
                    value={formState.payment}
                    onChange={handleFormChange}
                  >
                    {PAYMENTS.map((payment) => (
                      <option key={payment} value={payment}>
                        {payment}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                <span>Note</span>
                <textarea
                  name="note"
                  rows="3"
                  value={formState.note}
                  onChange={handleFormChange}
                  placeholder="Optional note"
                />
              </label>

              <footer className="modal-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={closeExpenseModal}
                >
                  Cancel
                </button>
                <button className="primary-button" type="submit">
                  {editingExpenseId ? 'Save changes' : 'Add expense'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {isSettingsModalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsSettingsModalOpen(false)}>
          <section
            className="expense-modal settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <p className="section-label">Settings</p>
                <h2 id="settings-modal-title">Monthly budget</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                aria-label="Close settings dialog"
              >
                X
              </button>
            </header>

            <div className="settings-form">
              <label>
                <span>Budget for {formatMonthLabel(selectedMonth)}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetDraft}
                  onChange={(event) => setBudgetDraft(event.target.value)}
                  placeholder="0.00"
                />
              </label>

              <div className="settings-data-actions" aria-label="Data controls">
                <button className="ghost-button" type="button" onClick={handleExport}>
                  Export
                </button>
                <label className="ghost-button file-input-label">
                  Import
                  <input
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    onChange={handleImport}
                  />
                </label>
              </div>

              <p className={`sync-status sync-status-${syncStatus.type}`}>
                {syncStatus.message}
              </p>

              <footer className="modal-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setIsSettingsModalOpen(false)}
                >
                  Cancel
                </button>
                <button className="primary-button" type="button" onClick={handleBudgetSave}>
                  Save budget
                </button>
              </footer>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function SummaryCard({ label, value, detail }) {
  return (
    <article className="summary-card">
      <p className="summary-label">{label}</p>
      <strong className="summary-value">{value}</strong>
      {detail ? <span className="summary-detail">{detail}</span> : null}
    </article>
  )
}

function getCategoryGroups(expenses) {
  return CATEGORIES.map((category) => {
    const categoryExpenses = expenses.filter((expense) => expense.category === category)
    return {
      category,
      expenses: categoryExpenses,
      count: categoryExpenses.length,
      amount: sumExpenses(categoryExpenses),
    }
  })
}

function normalizeCategory(category) {
  if (typeof category !== 'string' || !category) {
    return 'Others'
  }

  const normalizedCategory = CATEGORY_ALIASES[category] || category
  return CATEGORIES.includes(normalizedCategory) ? normalizedCategory : 'Others'
}

function sumExpenses(expenses) {
  return roundCurrency(
    expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0)
  )
}

function toAnchorId(value) {
  return value.toLowerCase().replace(/\s+/g, '-')
}

function toMonthKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}`
}

function toDateInputValue(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatCurrency(value) {
  return currencyFormatter.format(roundCurrency(value))
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatMonthLabel(monthKey) {
  const date = new Date(`${monthKey}-01T12:00:00`)
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatSyncTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function calculateAmountExpression(expression) {
  const normalizedExpression = expression.trim().replace(/,/g, '.').replace(/[x×]/gi, '*')

  if (!normalizedExpression) {
    return {
      isValid: false,
      value: 0,
    }
  }

  if (!/^\d+(?:\.\d+)?(?:\s*[+*]\s*\d+(?:\.\d+)?)*$/.test(normalizedExpression)) {
    return {
      isValid: false,
      value: 0,
    }
  }

  const value = normalizedExpression
    .split('+')
    .reduce((sum, additionPart) => {
      const product = additionPart
        .split('*')
        .reduce((total, factor) => total * Number(factor.trim()), 1)

      return sum + product
    }, 0)

  return {
    isValid: Number.isFinite(value),
    value: roundCurrency(value),
  }
}

function roundCurrency(value) {
  return Math.round(Number(value) * 100) / 100
}

export default App
