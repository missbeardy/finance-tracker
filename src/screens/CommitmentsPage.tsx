import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { formatAud } from '@/lib/money'
import { detectCommitments } from '@/lib/budget/recurrence'
import { useTransactions } from '@/hooks/useTransactions'
import { useCommitments, useSyncCommitments, useUpdateCommitment } from '@/hooks/useCommitments'
import type { CommitmentRow } from '@/hooks/useCommitments'

function cadenceLabel(days: number): string {
  if (days <= 9) return 'Weekly'
  if (days <= 18) return 'Fortnightly'
  if (days <= 45) return 'Monthly'
  if (days <= 120) return 'Quarterly'
  return 'Annual'
}

function statusMeta(status: string): { label: string; className: string } {
  switch (status) {
    case 'confirmed':
      return { label: 'Confirmed', className: 'bg-inbound/15 text-inbound' }
    case 'dismissed':
      return { label: 'Dismissed', className: 'bg-neutral/15 text-neutral' }
    case 'possibly_cancelled':
      return { label: 'Possibly cancelled', className: 'bg-caution/15 text-caution' }
    case 'price_increased':
      return { label: 'Price increased', className: 'bg-signal/15 text-signal' }
    default:
      return { label: 'Detected', className: 'bg-flow/15 text-flow' }
  }
}

export function CommitmentsPage() {
  const { data: txns = [], isLoading: txnsLoading } = useTransactions()
  const { data: commitments = [], isLoading: commitmentsLoading, error } = useCommitments()
  const sync = useSyncCommitments()
  const update = useUpdateCommitment()
  const [synced, setSynced] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')

  const detected = useMemo(() => detectCommitments(txns, today), [txns, today])

  const monthlyTotal = useMemo(
    () =>
      commitments
        .filter((c) => c.status === 'confirmed')
        .reduce((sum, c) => sum + Math.round((c.annualised_cents ?? 0) / 12), 0),
    [commitments],
  )

  const visible = commitments.filter((c) => c.status !== 'dismissed')
  const dismissed = commitments.filter((c) => c.status === 'dismissed')

  return (
    <section className="space-y-6 pb-4">
      <div>
        <Link to="/budget" className="text-xs font-medium text-flow">
          ← Budget
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">
              Commitments
            </h1>
            <p className="mt-2 max-w-prose text-sm text-ink-muted">
              What you're actually locked into — confirm the bills that recur so the budget can
              plan around them.
            </p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Confirmed, per month</p>
        <p className="money mt-2 text-[32px] leading-none text-ink">{formatAud(monthlyTotal)}</p>
      </div>

      <button
        type="button"
        onClick={() =>
          sync.mutate(detected, {
            onSuccess: () => setSynced(true),
          })
        }
        disabled={sync.isPending || txnsLoading}
        className="min-h-11 w-full rounded-xl bg-flow px-4 text-sm font-semibold text-on-accent disabled:opacity-60"
      >
        {sync.isPending ? 'Scanning ledger…' : 'Scan for recurring charges'}
      </button>
      {synced && (
        <p className="text-xs text-ink-muted" aria-live="polite">
          Scan complete — {detected.length} recurring pattern{detected.length === 1 ? '' : 's'}{' '}
          found in the ledger.
        </p>
      )}
      {error && (
        <p className="text-sm text-signal" role="alert">
          {error.message}
        </p>
      )}

      <div className="space-y-2">
        {commitmentsLoading && <p className="text-sm text-ink-muted">Loading…</p>}
        {!commitmentsLoading && visible.length === 0 && (
          <p className="text-sm text-ink-muted">
            No commitments yet. Run a scan to detect recurring bills and subscriptions from your
            imported transactions.
          </p>
        )}
        {visible.map((c) => (
          <CommitmentRowItem key={c.id} commitment={c} onUpdate={update.mutate} />
        ))}
      </div>

      {dismissed.length > 0 && (
        <details className="text-sm text-ink-muted">
          <summary className="cursor-pointer select-none font-medium">
            Dismissed ({dismissed.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {dismissed.map((c) => (
              <CommitmentRowItem key={c.id} commitment={c} onUpdate={update.mutate} />
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function CommitmentRowItem({
  commitment,
  onUpdate,
}: {
  commitment: CommitmentRow
  onUpdate: (args: { id: number; status?: string }) => void
}) {
  const meta = statusMeta(commitment.status)
  const nextDate = commitment.next_expected_date
    ? format(parseISO(commitment.next_expected_date), 'd MMM')
    : '—'

  return (
    <div className="card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{commitment.merchant}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {cadenceLabel(commitment.cadence_days)} · next ~{nextDate}
            {commitment.accounts?.name ? ` · ${commitment.accounts.name}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="ledger-mono text-sm text-ink">{formatAud(commitment.amount)}</p>
          <p className="text-[11px] text-ink-muted">
            {formatAud(Math.round((commitment.annualised_cents ?? 0) / 12))}/mo
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={['rounded-full px-2 py-1 text-[11px] font-medium', meta.className].join(' ')}>
          {meta.label}
        </span>
        <div className="flex gap-2">
          {commitment.status !== 'confirmed' && (
            <button
              type="button"
              onClick={() => onUpdate({ id: commitment.id, status: 'confirmed' })}
              className="min-h-8 rounded-lg border border-hairline px-3 text-xs font-semibold text-ink transition-colors duration-120 hover:border-flow"
            >
              Confirm
            </button>
          )}
          {commitment.status !== 'dismissed' && (
            <button
              type="button"
              onClick={() => onUpdate({ id: commitment.id, status: 'dismissed' })}
              className="min-h-8 rounded-lg border border-hairline px-3 text-xs font-medium text-ink-muted transition-colors duration-120 hover:border-signal hover:text-signal"
            >
              Dismiss
            </button>
          )}
          {commitment.status === 'dismissed' && (
            <button
              type="button"
              onClick={() => onUpdate({ id: commitment.id, status: 'detected' })}
              className="min-h-8 rounded-lg border border-hairline px-3 text-xs font-medium text-ink-muted transition-colors duration-120 hover:border-flow hover:text-flow"
            >
              Restore
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
