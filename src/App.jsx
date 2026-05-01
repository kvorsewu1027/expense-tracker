import { useEffect, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'ledger-bloom-react-state'
const CATEGORIES = [
  'Housing',
  'Groceries',
  'Transport',
  'Dining',
  'Utilities',
  'Health',
  'Shopping',
  'Entertainment',
  'Travel',
  'Other',
]
const PAYMENTS = ['Card', 'Cash', 'Transfer', 'Subscription']

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
    category: CATEGORIES[0],
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
          category:
            typeof expense?.category === 'string' && expense.category
              ? expense.category
              : 'Other',
          payment:
            typeof expense?.payment === 'string' && expense.payment
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

function App() {
  const [trackerState, setTrackerState] = useState(loadInitialState)
  const [formState, setFormState] = useState(createDefaultFormState)
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)

  const { expenses, budgetsByMonth, selectedMonth } = trackerState
  const [budgetDraft, setBudgetDraft] = useState(() =>
    budgetsByMonth[selectedMonth] !== undefined ? String(budgetsByMonth[selectedMonth]) : ''
  )
  const expensesForMonth = expenses
    .filter((expense) => expense.date.startsWith(selectedMonth))
    .sort((left, right) => right.date.localeCompare(left.date))
  const totalSpent = sumExpenses(expensesForMonth)
  const groupedCategories = getCategoryGroups(expensesForMonth)
  const transactionCount = expensesForMonth.length
  const budget = Number(budgetsByMonth[selectedMonth] ?? 0)
  const budgetProgress = budget ? Math.min((totalSpent / budget) * 100, 100) : 0
  const budgetDifference = roundCurrency(budget - totalSpent)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trackerState))
  }, [trackerState])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsExpenseModalOpen(false)
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

    const nextExpense = {
      id: crypto.randomUUID(),
      name: formState.name.trim(),
      amount: Number(formState.amount),
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

    setTrackerState((current) => ({
      ...current,
      expenses: [nextExpense, ...current.expenses],
      selectedMonth: nextMonth,
    }))
    setBudgetDraft(
      budgetsByMonth[nextMonth] !== undefined ? String(budgetsByMonth[nextMonth]) : ''
    )
    setFormState(createDefaultFormState())
    setIsExpenseModalOpen(false)
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
  }

  function handleDelete(expenseId) {
    setTrackerState((current) => ({
      ...current,
      expenses: current.expenses.filter((expense) => expense.id !== expenseId),
    }))
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(trackerState, null, 2)], {
      type: 'application/json',
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ledger-bloom-${selectedMonth}.json`
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
        const importedState = sanitizeState(JSON.parse(String(reader.result || '{}')))
        setTrackerState(importedState)
        setBudgetDraft(
          importedState.budgetsByMonth[importedState.selectedMonth] !== undefined
            ? String(importedState.budgetsByMonth[importedState.selectedMonth])
            : ''
        )
      } catch (error) {
        console.error('Unable to import file.', error)
        window.alert(
          'That file could not be imported. Please choose a valid Ledger Bloom JSON export.'
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
          <span className="brand-mark">LB</span>
          <div>
            <p className="workspace-label">Workspace</p>
            <h1>Ledger Bloom</h1>
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
            <p className="breadcrumb">Expenses / {formatMonthLabel(selectedMonth)}</p>
            <h2>Monthly expense board</h2>
          </div>

          <div className="topbar-actions">
            <label className="month-picker">
              <span>Month</span>
              <input type="month" value={selectedMonth} onChange={handleMonthChange} />
            </label>
            <button
              className="primary-button"
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
            >
              New expense
            </button>
          </div>
        </header>

        <section className="metrics-row" aria-label="Monthly summary">
          <SummaryCard label="Total spent" value={formatCurrency(totalSpent)} />
          <SummaryCard label="Transactions" value={String(transactionCount)} />
          <SummaryCard
            label="Budget"
            value={budget ? formatCurrency(budget) : 'Not set'}
            detail={
              budget
                ? budgetDifference >= 0
                  ? `${formatCurrency(budgetDifference)} left`
                  : `${formatCurrency(Math.abs(budgetDifference))} over`
                : 'Add one below'
            }
          />
        </section>

        <section className="controls-strip" aria-label="Budget and data controls">
          <div className="budget-control">
            <label>
              <span>Monthly budget</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={budgetDraft}
                onChange={(event) => setBudgetDraft(event.target.value)}
                placeholder="0.00"
              />
            </label>
            <button className="secondary-button" type="button" onClick={handleBudgetSave}>
              Save
            </button>
          </div>

          <div className="budget-track" aria-label="Budget usage">
            <div className="budget-bar">
              <div
                className="budget-progress"
                style={{ width: `${budgetProgress}%` }}
              />
            </div>
          </div>

          <div className="data-actions">
            <button className="ghost-button" type="button" onClick={handleExport}>
              Export
            </button>
            <label className="ghost-button file-input-label">
              Import
              <input type="file" accept="application/json" onChange={handleImport} />
            </label>
          </div>
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
                    <span aria-label="Actions" />
                  </div>
                  {categoryExpenses.map((expense) => (
                    <div className="expense-row" role="row" key={expense.id}>
                      <span>
                        <strong>{expense.name}</strong>
                        {expense.note ? <small>{expense.note}</small> : null}
                      </span>
                      <span>{formatDate(expense.date)}</span>
                      <span>{expense.payment}</span>
                      <span>{formatCurrency(expense.amount)}</span>
                      <button
                        className="delete-button"
                        type="button"
                        onClick={() => handleDelete(expense.id)}
                        aria-label={`Delete ${expense.name}`}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  className="empty-category"
                  type="button"
                  onClick={() => {
                    setFormState((current) => ({ ...current, category }))
                    setIsExpenseModalOpen(true)
                  }}
                >
                  Add a {category.toLowerCase()} expense
                </button>
              )}
            </article>
          ))}
        </section>
      </main>

      {isExpenseModalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsExpenseModalOpen(false)}>
          <section
            className="expense-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <p className="section-label">New record</p>
                <h2 id="expense-modal-title">Add expense</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                aria-label="Close add expense dialog"
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
                <label>
                  <span>Amount</span>
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formState.amount}
                    onChange={handleFormChange}
                    placeholder="0.00"
                    required
                  />
                </label>

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
                  onClick={() => setIsExpenseModalOpen(false)}
                >
                  Cancel
                </button>
                <button className="primary-button" type="submit">
                  Add expense
                </button>
              </footer>
            </form>
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

function roundCurrency(value) {
  return Math.round(Number(value) * 100) / 100
}

export default App
