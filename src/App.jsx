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
  const [budgetDraft, setBudgetDraft] = useState('')

  const { expenses, budgetsByMonth, selectedMonth } = trackerState
  const expensesForMonth = expenses
    .filter((expense) => expense.date.startsWith(selectedMonth))
    .sort((left, right) => right.date.localeCompare(left.date))
  const totalSpent = sumExpenses(expensesForMonth)
  const categoryTotals = getCategoryTotals(expensesForMonth)
  const transactionCount = expensesForMonth.length
  const activeDays = new Set(expensesForMonth.map((expense) => expense.date)).size || 1
  const dailyAverage = roundCurrency(totalSpent / activeDays)
  const topCategory = categoryTotals[0] ?? null
  const budget = Number(budgetsByMonth[selectedMonth] ?? 0)
  const budgetProgress = budget ? Math.min((totalSpent / budget) * 100, 100) : 0
  const budgetDifference = roundCurrency(budget - totalSpent)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trackerState))
  }, [trackerState])

  useEffect(() => {
    setBudgetDraft(
      budgetsByMonth[selectedMonth] !== undefined
        ? String(budgetsByMonth[selectedMonth])
        : ''
    )
  }, [budgetsByMonth, selectedMonth])

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

    setTrackerState((current) => ({
      ...current,
      expenses: [nextExpense, ...current.expenses],
      selectedMonth: nextExpense.date.slice(0, 7),
    }))
    setFormState(createDefaultFormState())
  }

  function handleMonthChange(event) {
    const nextMonth = event.target.value || toMonthKey(new Date())
    setTrackerState((current) => ({
      ...current,
      selectedMonth: nextMonth,
    }))
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
        setTrackerState(sanitizeState(JSON.parse(String(reader.result || '{}'))))
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
    <div className="page-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Monthly expense tracker</p>
          <h1>Ledger Bloom</h1>
          <p className="hero-text">
            A responsive expense tracker that feels comfortable on laptop and phone,
            with monthly summaries, category insights, and simple data export.
          </p>
        </div>

        <div className="hero-actions">
          <button className="ghost-button" type="button" onClick={handleExport}>
            Export data
          </button>
          <label className="ghost-button file-input-label">
            Import data
            <input type="file" accept="application/json" onChange={handleImport} />
          </label>
        </div>
      </header>

      <main className="layout">
        <section className="panel panel-form">
          <div className="panel-heading">
            <div>
              <p className="section-label">Quick add</p>
              <h2>Add an expense</h2>
            </div>
            <p className="section-hint">Stored locally in this browser.</p>
          </div>

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

            <div className="budget-row">
              <label>
                <span>Monthly budget</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetDraft}
                  onChange={(event) => setBudgetDraft(event.target.value)}
                  placeholder="Set a target for the selected month"
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={handleBudgetSave}
              >
                Save budget
              </button>
            </div>

            <button className="primary-button" type="submit">
              Add expense
            </button>
          </form>
        </section>

        <section className="panel panel-dashboard">
          <div className="panel-heading">
            <div>
              <p className="section-label">Overview</p>
              <h2>Monthly snapshot</h2>
            </div>
            <label className="month-picker">
              <span>Month</span>
              <input type="month" value={selectedMonth} onChange={handleMonthChange} />
            </label>
          </div>

          <div className="summary-grid">
            <SummaryCard
              label="Total spent"
              value={formatCurrency(totalSpent)}
              detail={`For ${formatMonthLabel(selectedMonth)}`}
            />
            <SummaryCard
              label="Transactions"
              value={String(transactionCount)}
              detail={
                transactionCount
                  ? 'Keep logging to spot patterns.'
                  : 'No spending logged yet.'
              }
            />
            <SummaryCard
              label="Daily average"
              value={formatCurrency(dailyAverage)}
              detail="Average across active spending days."
            />
            <SummaryCard
              label="Top category"
              value={topCategory ? topCategory.category : 'No data'}
              detail={
                topCategory
                  ? formatCurrency(topCategory.amount)
                  : 'Add your first expense.'
              }
            />
          </div>

          <section className="budget-panel">
            <div className="budget-copy">
              <p className="section-label">Budget</p>
              <h3>
                {budget
                  ? `${formatCurrency(totalSpent)} of ${formatCurrency(budget)} used`
                  : 'No budget set yet'}
              </h3>
              <p id="budgetText">
                {budget
                  ? budgetDifference >= 0
                    ? `${formatCurrency(budgetDifference)} remaining this month.`
                    : `${formatCurrency(Math.abs(budgetDifference))} over budget.`
                  : 'Add a monthly budget to see whether your spending is on track.'}
              </p>
            </div>
            <div className="budget-bar" aria-hidden="true">
              <div
                className="budget-progress"
                style={{ width: `${budgetProgress}%` }}
              />
            </div>
          </section>

          <section className="breakdown-panel">
            <div className="panel-heading compact">
              <div>
                <p className="section-label">Breakdown</p>
                <h3>Spending by category</h3>
              </div>
            </div>

            {categoryTotals.length ? (
              <div className="category-breakdown">
                {categoryTotals.map(({ category, amount }) => {
                  const share = totalSpent
                    ? Math.round((amount / totalSpent) * 100)
                    : 0

                  return (
                    <div className="category-row" key={category}>
                      <div className="category-label-row">
                        <strong>{category}</strong>
                        <span>
                          {formatCurrency(amount)} / {share}%
                        </span>
                      </div>
                      <div className="category-bar">
                        <div
                          className="category-fill"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="empty-state">
                Category totals will appear here once you log expenses.
              </p>
            )}
          </section>
        </section>

        <section className="panel panel-history">
          <div className="panel-heading">
            <div>
              <p className="section-label">History</p>
              <h2>Transactions</h2>
            </div>
            <p className="section-hint">
              {transactionCount} transaction{transactionCount === 1 ? '' : 's'} in{' '}
              {formatMonthLabel(selectedMonth)}
            </p>
          </div>

          <div className="transaction-list">
            {expensesForMonth.length ? (
              expensesForMonth.map((expense) => (
                <article className="transaction-card" key={expense.id}>
                  <div className="transaction-main">
                    <div>
                      <h3 className="transaction-name">{expense.name}</h3>
                      <p className="transaction-meta">
                        {formatDate(expense.date)} / {expense.category} /{' '}
                        {expense.payment}
                      </p>
                    </div>
                    <strong className="transaction-amount">
                      {formatCurrency(expense.amount)}
                    </strong>
                  </div>

                  {expense.note ? (
                    <p className="transaction-note">{expense.note}</p>
                  ) : null}

                  <button
                    className="delete-button"
                    type="button"
                    onClick={() => handleDelete(expense.id)}
                  >
                    Delete
                  </button>
                </article>
              ))
            ) : (
              <p className="empty-state">
                No expenses in this month yet. Add one from the form to get started.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function SummaryCard({ label, value, detail }) {
  return (
    <article className="summary-card">
      <p className="summary-label">{label}</p>
      <strong className="summary-value">{value}</strong>
      <span className="summary-detail">{detail}</span>
    </article>
  )
}

function getCategoryTotals(expenses) {
  const totals = expenses.reduce((accumulator, expense) => {
    accumulator[expense.category] =
      (accumulator[expense.category] || 0) + Number(expense.amount || 0)

    return accumulator
  }, {})

  return Object.entries(totals)
    .map(([category, amount]) => ({
      category,
      amount: roundCurrency(amount),
    }))
    .sort((left, right) => right.amount - left.amount)
}

function sumExpenses(expenses) {
  return roundCurrency(
    expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0)
  )
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
    year: 'numeric',
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
