import { Link } from 'react-router-dom'
import { formatAud } from '@/lib/money'
import { QueryError } from '@/components/QueryError'
import { getErrorMessage } from '@/lib/errors'
import { useAccountBalances, isLiabilityType } from '@/hooks/useAccountBalances'
import { COLOR_TOKEN_HEX, type ColorToken } from '@/lib/accounts'

export function NetWorthPage() {
  const { balances, assetsCents, liabilitiesCents, netWorthCents, isLoading, error, refetch } =
    useAccountBalances()

  const assets = balances.filter((b) => !isLiabilityType(b.type))
  const liabilities = balances.filter((b) => isLiabilityType(b.type))
  const investments = balances.filter((b) => b.type === 'investment')

  return (
    <section className="space-y-6">
      <div>
        <Link to="/more" className="text-xs font-medium text-flow">
          ← More
        </Link>
        <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight text-ink">
          Net worth
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Assets minus liabilities from account balances (statement balance when imported, otherwise
          opening + activity).
        </p>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading balances…</p>}
      {error && (
        <QueryError message={getErrorMessage(error)} onRetry={() => void refetch()} />
      )}

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Net worth</p>
        <p className="money mt-2 text-[44px] leading-none text-ink">
          {netWorthCents == null ? '—' : formatAud(netWorthCents)}
        </p>
        <dl className="mt-4 space-y-2 border-t border-hairline pt-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Assets</dt>
            <dd className="ledger-mono text-inbound">{formatAud(assetsCents)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Liabilities</dt>
            <dd className="ledger-mono text-outbound">{formatAud(-liabilitiesCents)}</dd>
          </div>
        </dl>
      </div>

      <BalanceGroup title="Assets" rows={assets} />
      <BalanceGroup title="Liabilities" rows={liabilities} liability />
      {investments.length > 0 && <BalanceGroup title="Investments" rows={investments} />}

      <p className="text-xs text-ink-muted">
        Tip: map a Balance column on CSV import, or set opening balances on Accounts, for fuller
        coverage. Historical trend charts need regular imports over time.
      </p>
    </section>
  )
}

function BalanceGroup({
  title,
  rows,
  liability,
}: {
  title: string
  rows: ReturnType<typeof useAccountBalances>['balances']
  liability?: boolean
}) {
  if (rows.length === 0) return null
  return (
    <div>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">{title}</h2>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.accountId} className="flex items-center gap-3 rounded-lg bg-surface p-4">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{
                background:
                  COLOR_TOKEN_HEX[(row.colorToken as ColorToken) ?? 'cat-8'] ?? '#94A3B8',
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{row.name}</p>
              <p className="text-xs text-ink-muted">
                {row.institution} · {row.type.replace('_', ' ')}
                {row.source !== 'unknown' ? ` · ${row.source}` : ''}
              </p>
            </div>
            <p className="ledger-mono shrink-0 text-sm text-ink">
              {row.balanceCents == null
                ? '—'
                : formatAud(liability ? -Math.abs(row.balanceCents) : row.balanceCents)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
