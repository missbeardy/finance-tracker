import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  useMortgages,
  useCreateMortgage,
  useUpdateMortgage,
  useDeleteMortgage,
  type MortgageRow,
} from '@/hooks/useMortgages'
import { useAccounts } from '@/hooks/useAccounts'
import { formatAud, parseDollarsToCents } from '@/lib/money'
import { getErrorMessage } from '@/lib/errors'
import { QueryError } from '@/components/QueryError'
import { buildSchedule, currentProgress, type MortgageTerms } from '@/lib/mortgage/amortization'

type Draft = {
  name: string
  lender: string
  account_id: string
  original_balance: string
  interest_rate: string
  term_years: string
  start_date: string
}

const emptyDraft = (): Draft => ({
  name: '',
  lender: '',
  account_id: '',
  original_balance: '',
  interest_rate: '',
  term_years: '30',
  start_date: format(new Date(), 'yyyy-MM-dd'),
})

function draftFromMortgage(m: MortgageRow): Draft {
  return {
    name: m.name,
    lender: m.lender,
    account_id: m.account_id != null ? String(m.account_id) : '',
    original_balance: (m.original_balance / 100).toFixed(2),
    interest_rate: String(m.interest_rate),
    term_years: String(m.term_years),
    start_date: m.start_date,
  }
}

function termsFromMortgage(m: MortgageRow): MortgageTerms {
  return {
    originalBalance: m.original_balance,
    interestRate: m.interest_rate,
    termYears: m.term_years,
    startDate: m.start_date,
  }
}

export function MortgagePage() {
  const { data: mortgages = [], isLoading, error, refetch } = useMortgages()
  const { data: accounts = [] } = useAccounts()
  const createMortgage = useCreateMortgage()
  const updateMortgage = useUpdateMortgage()
  const deleteMortgage = useDeleteMortgage()

  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [formError, setFormError] = useState<string | null>(null)
  const [scheduleOpenId, setScheduleOpenId] = useState<number | null>(null)

  const title = editingId === 'new' ? 'Add mortgage' : editingId != null ? 'Edit mortgage' : 'Mortgages'

  async function save() {
    setFormError(null)
    if (!draft.name.trim() || !draft.lender.trim()) {
      setFormError('Name and lender are required.')
      return
    }
    const balance = parseDollarsToCents(draft.original_balance)
    if (balance == null || balance <= 0) {
      setFormError('Original balance must look like 750000.00')
      return
    }
    const rate = Number(draft.interest_rate)
    if (!Number.isFinite(rate) || rate < 0) {
      setFormError('Interest rate must be a number, e.g. 5.75')
      return
    }
    const termYears = Number(draft.term_years)
    if (!Number.isInteger(termYears) || termYears <= 0) {
      setFormError('Term must be a whole number of years, e.g. 30')
      return
    }
    if (!draft.start_date) {
      setFormError('Start date is required.')
      return
    }

    const payload = {
      name: draft.name.trim(),
      lender: draft.lender.trim(),
      account_id: draft.account_id ? Number(draft.account_id) : null,
      original_balance: balance,
      interest_rate: rate,
      term_years: termYears,
      start_date: draft.start_date,
    }

    try {
      if (editingId === 'new') {
        await createMortgage.mutateAsync(payload)
      } else if (typeof editingId === 'number') {
        await updateMortgage.mutateAsync({ id: editingId, ...payload })
      }
      setEditingId(null)
      setDraft(emptyDraft())
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not save mortgage'))
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/more" className="text-xs font-medium text-flow">
            ← More
          </Link>
          <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Loan basics in, full amortization schedule and payoff progress out.
          </p>
        </div>
        {editingId == null && (
          <button
            type="button"
            className="rounded-md bg-flow px-3 py-2 text-sm font-medium text-on-accent"
            onClick={() => {
              setDraft(emptyDraft())
              setEditingId('new')
              setFormError(null)
            }}
          >
            Add
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {error && <QueryError message={getErrorMessage(error)} onRetry={() => void refetch()} />}

      {editingId != null ? (
        <div className="space-y-3 card p-4">
          <Field label="Name">
            <input
              className="field"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Home loan"
            />
          </Field>
          <Field label="Lender">
            <input
              className="field"
              value={draft.lender}
              onChange={(e) => setDraft({ ...draft, lender: e.target.value })}
              placeholder="CommBank"
            />
          </Field>
          <Field label="Linked account (optional)">
            <select
              className="field"
              value={draft.account_id}
              onChange={(e) => setDraft({ ...draft, account_id: e.target.value })}
            >
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.institution})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Original balance">
            <input
              className="field ledger-mono"
              value={draft.original_balance}
              onChange={(e) => setDraft({ ...draft, original_balance: e.target.value })}
              placeholder="750000.00"
            />
          </Field>
          <Field label="Interest rate (% p.a.)">
            <input
              className="field ledger-mono"
              value={draft.interest_rate}
              onChange={(e) => setDraft({ ...draft, interest_rate: e.target.value })}
              placeholder="5.75"
            />
          </Field>
          <Field label="Term (years)">
            <input
              className="field ledger-mono"
              value={draft.term_years}
              onChange={(e) => setDraft({ ...draft, term_years: e.target.value })}
              placeholder="30"
            />
          </Field>
          <Field label="Start date">
            <input
              type="date"
              className="field"
              value={draft.start_date}
              onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
            />
          </Field>
          {formError && (
            <p className="text-sm text-signal" role="alert">
              {formError}
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="rounded-md bg-flow px-3 py-2 text-sm font-medium text-on-accent"
              onClick={() => void save()}
            >
              Save
            </button>
            <button
              type="button"
              className="rounded-md border border-hairline px-3 py-2 text-sm"
              onClick={() => {
                setEditingId(null)
                setFormError(null)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-4">
          {mortgages.length === 0 && !isLoading && (
            <li className="card p-4 text-sm text-ink-muted">
              No mortgages yet. Add one with the loan's original balance, rate, and term — the
              schedule and progress are calculated automatically.
            </li>
          )}
          {mortgages.map((m) => (
            <MortgageCard
              key={m.id}
              mortgage={m}
              scheduleOpen={scheduleOpenId === m.id}
              onToggleSchedule={() =>
                setScheduleOpenId(scheduleOpenId === m.id ? null : m.id)
              }
              onEdit={() => {
                setDraft(draftFromMortgage(m))
                setEditingId(m.id)
                setFormError(null)
              }}
              onDelete={() => {
                if (confirm(`Delete ${m.name}?`)) {
                  void deleteMortgage.mutateAsync(m.id)
                }
              }}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function MortgageCard({
  mortgage,
  scheduleOpen,
  onToggleSchedule,
  onEdit,
  onDelete,
}: {
  mortgage: MortgageRow
  scheduleOpen: boolean
  onToggleSchedule: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const terms = useMemo(() => termsFromMortgage(mortgage), [mortgage])
  const progress = useMemo(() => currentProgress(terms), [terms])
  const schedule = useMemo(() => (scheduleOpen ? buildSchedule(terms) : []), [terms, scheduleOpen])
  const yearlySchedule = useMemo(() => {
    if (!scheduleOpen) return []
    const byYear = new Map<number, { principal: number; interest: number; balance: number }>()
    for (const row of schedule) {
      const year = Math.ceil(row.paymentNumber / 12)
      const existing = byYear.get(year) ?? { principal: 0, interest: 0, balance: row.balance }
      existing.principal += row.principal
      existing.interest += row.interest
      existing.balance = row.balance
      byYear.set(year, existing)
    }
    return [...byYear.entries()].map(([year, v]) => ({ year, ...v }))
  }, [schedule, scheduleOpen])

  const percent = Math.min(100, Math.round(progress.percentPaid * 100))

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{mortgage.name}</p>
          <p className="text-xs text-ink-muted">
            {mortgage.lender} · {mortgage.interest_rate}% · {mortgage.term_years} yr term
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button type="button" className="text-xs text-ink-muted" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="text-xs text-signal" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Balance remaining" value={formatAud(progress.currentBalance)} />
        <Stat label="Monthly payment" value={formatAud(progress.monthlyPayment)} />
        <Stat label="Principal paid" value={formatAud(progress.principalPaid)} />
        <Stat label="Interest paid to date" value={formatAud(progress.interestPaidToDate)} />
      </div>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-paper-deep">
          <div
            className="h-full rounded-full bg-flow"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {percent}% paid off · {progress.paymentsMade} of {progress.paymentsMade + progress.paymentsRemaining}{' '}
          payments made
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {progress.yearsRemaining > 0
            ? `~${progress.yearsRemaining.toFixed(1)} years remaining`
            : 'Paid off'}{' '}
          · payoff {format(parseISO(progress.payoffDate), 'MMM yyyy')}
        </p>
      </div>

      <button
        type="button"
        className="mt-4 text-xs font-medium text-flow"
        onClick={onToggleSchedule}
      >
        {scheduleOpen ? 'Hide amortization schedule' : 'Show amortization schedule'}
      </button>

      {scheduleOpen && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-xs">
            <thead>
              <tr className="text-ink-muted">
                <th className="py-1 pr-2 font-medium">Year</th>
                <th className="py-1 pr-2 font-medium">Principal</th>
                <th className="py-1 pr-2 font-medium">Interest</th>
                <th className="py-1 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {yearlySchedule.map((row) => (
                <tr key={row.year} className="border-t border-hairline">
                  <td className="ledger-mono py-1.5 pr-2">{row.year}</td>
                  <td className="ledger-mono py-1.5 pr-2">{formatAud(row.principal)}</td>
                  <td className="ledger-mono py-1.5 pr-2">{formatAud(row.interest)}</td>
                  <td className="ledger-mono py-1.5">{formatAud(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="money mt-1 text-sm text-ink">{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  )
}
