import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatAud } from '@/lib/money'
import { monthlyNormalise } from '@/lib/budget/calc'
import { QueryError } from '@/components/QueryError'
import { getErrorMessage } from '@/lib/errors'
import { useAccountBalances, isLiabilityType } from '@/hooks/useAccountBalances'
import { useCommitments } from '@/hooks/useCommitments'

export function DebtPage() {
  const { balances, isLoading, error, refetch } = useAccountBalances()
  const { data: commitments = [] } = useCommitments()

  const debts = useMemo(() => {
    return balances
      .filter((b) => isLiabilityType(b.type))
      .map((b) => {
        const related = commitments.filter(
          (c) =>
            c.status === 'confirmed' &&
            c.account_id === b.accountId,
        )
        const monthlyMin = related.reduce((sum, c) => {
          const annual = c.annualised_cents ?? monthlyNormalise(c.amount, c.cadence_days) * 12
          return sum + Math.round(annual / 12)
        }, 0)
        const owed = Math.abs(b.balanceCents ?? 0)
        const months =
          monthlyMin > 0 && owed > 0 ? Math.ceil(owed / monthlyMin) : null
        return { ...b, monthlyMin, owed, months }
      })
  }, [balances, commitments])

  const totalOwed = debts.reduce((s, d) => s + d.owed, 0)
  const totalMin = debts.reduce((s, d) => s + d.monthlyMin, 0)

  return (
    <section className="space-y-6">
      <div>
        <Link to="/more" className="text-xs font-medium text-flow">
          ← More
        </Link>
        <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight text-ink">
          Debt payoff
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Loan and credit-card balances with estimated months to clear at confirmed commitment
          minimums.
        </p>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {error && (
        <QueryError message={getErrorMessage(error)} onRetry={() => void refetch()} />
      )}

      <div className="card p-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Total owed</p>
        <p className="money mt-2 text-[28px] text-ink">{formatAud(totalOwed)}</p>
        <p className="mt-2 text-sm text-ink-muted">
          {totalMin > 0
            ? `${formatAud(totalMin)} / month in confirmed minimums`
            : 'Confirm loan/credit commitments to estimate payoff pace'}
        </p>
      </div>

      {debts.length === 0 ? (
        <p className="card p-4 text-sm text-ink-muted">
          No loan or credit-card accounts yet. Add them under Accounts.
        </p>
      ) : (
        <ul className="space-y-3">
          {debts.map((d) => (
            <li key={d.accountId} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{d.name}</p>
                  <p className="text-xs text-ink-muted">
                    {d.institution} · {d.type.replace('_', ' ')}
                  </p>
                </div>
                <p className="ledger-mono text-sm font-medium text-ink">{formatAud(d.owed)}</p>
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Monthly minimum</dt>
                  <dd className="ledger-mono text-ink">
                    {d.monthlyMin > 0 ? formatAud(d.monthlyMin) : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Est. months to clear</dt>
                  <dd className="ledger-mono text-ink">
                    {d.months != null ? `~${d.months}` : '—'}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      <Link to="/commitments" className="inline-flex min-h-11 items-center text-sm font-semibold text-flow">
        Manage commitments →
      </Link>
    </section>
  )
}
