import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { format, parseISO } from 'date-fns'
import { formatAud } from '@/lib/money'
import { rangeForPeriod, type PeriodKey } from '@/lib/period'
import { useDashboardData, type DashTxn } from '@/hooks/useDashboardData'
import { useSettings } from '@/hooks/useSettings'
import { useAccountBalances } from '@/hooks/useAccountBalances'
import { useSavingsGoals } from '@/hooks/useSavingsGoals'
import { useAuth } from '@/lib/auth'
import { COLOR_TOKEN_HEX, type ColorToken } from '@/lib/accounts'
import { QueryError } from '@/components/QueryError'
import { MoneySankey } from '@/components/MoneySankey'
import { getErrorMessage } from '@/lib/errors'

const GOAL_ACCENTS = [
  COLOR_TOKEN_HEX['cat-2'],
  COLOR_TOKEN_HEX['cat-4'],
  COLOR_TOKEN_HEX['cat-1'],
  COLOR_TOKEN_HEX['cat-6'],
] as const

function displayName(email: string | undefined, meta: Record<string, unknown> | undefined): string {
  const full = typeof meta?.full_name === 'string' ? meta.full_name.trim() : ''
  const name = typeof meta?.name === 'string' ? meta.name.trim() : ''
  const picked = full || name
  if (picked) return picked.split(/\s+/)[0] ?? picked
  if (email) {
    const local = email.split('@')[0] ?? ''
    return local.charAt(0).toUpperCase() + local.slice(1)
  }
  return 'there'
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
}

function timeGreeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

type NotifItem = { key: string; label: string; to: string }

export function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: settings } = useSettings()
  const [period, setPeriod] = useState<PeriodKey>('this_month')
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const range = useMemo(
    () =>
      rangeForPeriod(period, {
        payday: settings?.payday,
      }),
    [period, settings?.payday],
  )

  const { outbound, topCategories, alerts, isLoading, error, data, refetch, sankey, netSeries } =
    useDashboardData(range)
  const netSeriesSafe = netSeries ?? []
  const sankeySafe = sankey ?? []
  const { netWorthCents, isLoading: netWorthLoading } = useAccountBalances()
  const { data: savingsGoals } = useSavingsGoals()

  useEffect(() => {
    if (!notifOpen) return
    function onPointerDown(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [notifOpen])

  const firstName = displayName(
    user?.email,
    user?.user_metadata as Record<string, unknown> | undefined,
  )
  const avatarInitials = initials(firstName)

  const notifItems = useMemo<NotifItem[]>(() => {
    const items: NotifItem[] = []
    if ((alerts?.uncategorised ?? 0) > 0) {
      items.push({
        key: 'uncategorised',
        label: `Review ${alerts!.uncategorised} uncategorised`,
        to: '/review',
      })
    }
    if ((alerts?.pendingTransfers ?? 0) > 0) {
      items.push({
        key: 'transfers',
        label: `${alerts!.pendingTransfers} transfers to review`,
        to: '/transfers',
      })
    }
    if (alerts?.daysSinceImport != null && alerts.daysSinceImport >= 7) {
      items.push({
        key: 'import',
        label: `Last import ${alerts.daysSinceImport}d ago`,
        to: '/import',
      })
    }
    return items
  }, [alerts])

  const notifCount =
    (alerts?.uncategorised ?? 0) +
    (alerts?.pendingTransfers ?? 0) +
    (alerts?.daysSinceImport != null && alerts.daysSinceImport >= 7 ? 1 : 0)

  const chartData = useMemo(() => {
    const total = topCategories.reduce((s, c) => s + c.cents, 0) || 1
    return topCategories.slice(0, 5).map((c) => ({
      id: c.id,
      name: c.name,
      value: c.cents,
      color: c.color,
      pct: Math.round((c.cents / total) * 100),
    }))
  }, [topCategories])

  const recentTxns = useMemo(() => {
    return (data?.current ?? [])
      .filter((t) => t.transfer_id == null && t.status !== 'excluded')
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
      .slice(0, 5)
  }, [data?.current])

  const savingsTarget = settings?.savings_target_cents ?? null
  const savingsProgressCents = useMemo(() => {
    if (savingsTarget == null || savingsTarget <= 0) return 0
    const inbound = (data?.current ?? [])
      .filter((t) => t.transfer_id == null && t.status !== 'excluded' && t.amount > 0)
      .reduce((s, t) => s + t.amount, 0)
    return Math.min(Math.max(0, inbound - outbound), savingsTarget)
  }, [data?.current, outbound, savingsTarget])

  const savingsPct =
    savingsTarget && savingsTarget > 0
      ? Math.min(100, Math.round((savingsProgressCents / savingsTarget) * 100))
      : 0

  const hasGoals = (savingsGoals?.length ?? 0) > 0

  return (
    <section className="relative space-y-4 pb-16">
      {/* Full-bleed purple hero */}
      <header className="relative -mx-4 overflow-hidden bg-ink px-4 pb-6 pt-1 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-flow/45 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 left-4 h-40 w-40 rounded-full bg-flow-soft/40 blur-3xl"
        />

        <div className="relative flex items-start justify-between gap-3 pt-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-flow text-sm font-semibold text-white ring-2 ring-white/20"
              aria-hidden
            >
              {avatarInitials}
            </div>
            <div className="min-w-0">
              <h1 className="font-display truncate text-[28px] font-semibold leading-none tracking-tight">
                Hello {firstName}!
              </h1>
              <p className="mt-2 text-sm text-white/65">
                {timeGreeting()} · {range.label}
              </p>
            </div>
          </div>

          <div className="relative shrink-0" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white/85"
              aria-label="Notifications"
              aria-expanded={notifOpen}
              aria-haspopup="menu"
            >
              <BellIcon />
              {notifCount > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-signal px-1 text-xs font-semibold text-white"
                  aria-hidden
                >
                  {notifCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg bg-surface p-2 text-ink shadow-soft"
              >
                {notifItems.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-ink-muted">You&rsquo;re caught up</p>
                ) : (
                  <ul>
                    {notifItems.map((item) => (
                      <li key={item.key}>
                        <Link
                          to={item.to}
                          role="menuitem"
                          onClick={() => setNotifOpen(false)}
                          className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-paper-deep"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="dash-period">
            Period
          </label>
          <select
            id="dash-period"
            className="ml-auto min-h-11 rounded-full border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white outline-none"
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
          >
            <option value="this_month" className="text-ink">
              This month
            </option>
            <option value="last_month" className="text-ink">
              Last month
            </option>
            <option value="pay_cycle" className="text-ink">
              Pay cycle
            </option>
          </select>
        </div>
      </header>

      {isLoading && (
        <p className="text-sm text-ink-muted" aria-live="polite">
          Loading figures…
        </p>
      )}
      {error && (
        <QueryError message={getErrorMessage(error)} onRetry={() => void refetch()} />
      )}

      {/* Net worth strip */}
      <Link
        to="/net-worth"
        className="block rounded-lg border border-hairline bg-surface p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">Net worth</h2>
            {netWorthLoading ? (
              <p className="mt-2 text-sm text-ink-muted">Loading…</p>
            ) : netWorthCents == null ? (
              <p className="mt-2 text-sm text-ink-muted">
                Add opening balances or import with balance column
              </p>
            ) : (
              <p className="money mt-2 text-[28px] text-ink">{formatAud(netWorthCents)}</p>
            )}
          </div>
          <span aria-hidden className="shrink-0 text-sm font-semibold text-flow">
            →
          </span>
        </div>
      </Link>

      {/* Monthly spending — donut + legend */}
      <div className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-base font-semibold text-ink">Monthly spending</h2>

        {chartData.length === 0 ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ink-muted">
              No spending in this period yet. Import a CSV to get started.
            </p>
            <button
              type="button"
              onClick={() => navigate('/import')}
              className="inline-flex min-h-11 items-center rounded-xl bg-flow px-4 text-sm font-semibold text-white"
            >
              Import CSV
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-4">
            <ul className="min-w-0 flex-1 space-y-3">
              {chartData.map((row) => (
                <li key={row.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: row.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-ink">{row.name}</span>
                  <span className="ledger-mono shrink-0 text-ink-muted">{row.pct}%</span>
                </li>
              ))}
            </ul>
            <div className="relative h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="64%"
                    outerRadius="94%"
                    stroke="none"
                    paddingAngle={2}
                    startAngle={90}
                    endAngle={-270}
                  >
                    {chartData.map((row) => (
                      <Cell key={row.id} fill={row.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
                <p className="money text-[20px] leading-none text-ink">{formatAud(outbound)}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Total spent
                </p>
              </div>
            </div>
          </div>
        )}

        <Link
          to="/insights"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-flow"
        >
          More insights →
        </Link>
      </div>

      {/* Net trend sparkline */}
      {netSeriesSafe.length > 1 && (
        <div className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-base font-semibold text-ink">Net trend</h2>
          <div className="mt-4 h-20">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={netSeriesSafe}>
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="var(--flow)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Money flow */}
      {sankeySafe.length > 0 && (
        <div className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-base font-semibold text-ink">Where money flows</h2>
          <div className="mt-4">
            <MoneySankey links={sankeySafe} onCategoryClick={() => navigate('/ledger')} />
          </div>
        </div>
      )}

      {/* Savings goals */}
      <div className="rounded-lg border border-hairline bg-surface p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Savings goals</h2>
          {hasGoals && (
            <Link
              to="/settings#savings-goals"
              className="min-h-11 inline-flex items-center text-sm font-semibold text-flow"
            >
              Manage goals →
            </Link>
          )}
        </div>

        {hasGoals ? (
          <ul className="mt-4 space-y-4">
            {savingsGoals!.map((goal, i) => {
              const accent = GOAL_ACCENTS[i % GOAL_ACCENTS.length]!
              const pct =
                goal.target_cents > 0
                  ? Math.min(100, Math.round((goal.current_cents / goal.target_cents) * 100))
                  : 0
              return (
                <li key={goal.id} className="flex items-start gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `color-mix(in srgb, ${accent} 16%, white)` }}
                    aria-hidden
                  >
                    <GoalGlyph accent={accent} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-ink">{goal.name}</p>
                      <p className="ledger-mono shrink-0 text-sm text-ink-muted">{pct}%</p>
                    </div>
                    <p className="mt-1 money text-right text-sm text-ink-muted">
                      {formatAud(goal.current_cents)}
                      <span> / </span>
                      {formatAud(goal.target_cents)}
                    </p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-deep">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${Math.max(pct > 0 ? 4 : 0, pct)}%`,
                          background: accent,
                        }}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : savingsTarget == null || savingsTarget <= 0 ? (
          <div className="mt-4">
            <p className="text-sm text-ink-muted">
              No savings target set. Add one in Settings to track progress here.
            </p>
            <Link
              to="/settings"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-flow"
            >
              Open settings →
            </Link>
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-flow/15 text-flow">
              <GoalGlyph accent="currentColor" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-ink">Savings target</p>
                <p className="ledger-mono text-sm font-medium text-ink">{savingsPct}%</p>
              </div>
              <p className="mt-1 money text-right text-sm text-ink-muted">
                {formatAud(savingsProgressCents)}
                <span> / </span>
                {formatAud(savingsTarget)}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper-deep">
                <div
                  className="h-full rounded-full bg-flow transition-[width] duration-300"
                  style={{ width: `${Math.max(savingsPct > 0 ? 4 : 0, savingsPct)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div className="rounded-lg border border-hairline bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Recent transactions</h2>
          <Link to="/ledger" className="min-h-11 inline-flex items-center text-sm font-semibold text-flow">
            View all
          </Link>
        </div>

        {recentTxns.length === 0 ? (
          <p className="text-sm text-ink-muted">No transactions in this period.</p>
        ) : (
          <ul>
            {recentTxns.map((txn, i) => (
              <RecentRow
                key={txn.id}
                txn={txn}
                memberInitial={avatarInitials.slice(0, 1)}
                showDivider={i < recentTxns.length - 1}
              />
            ))}
          </ul>
        )}
      </div>

      {(alerts?.uncategorised ||
        alerts?.pendingTransfers ||
        (alerts?.daysSinceImport != null && alerts.daysSinceImport >= 7)) && (
        <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
          {(alerts.uncategorised ?? 0) > 0 && (
            <Link
              to="/review"
              className="shrink-0 rounded-xl border border-hairline bg-surface px-3 py-2 font-medium text-ink"
            >
              {alerts.uncategorised} uncategorised
            </Link>
          )}
          {(alerts.pendingTransfers ?? 0) > 0 && (
            <Link
              to="/transfers"
              className="shrink-0 rounded-xl bg-flow px-3 py-2 font-semibold text-white"
            >
              {alerts.pendingTransfers} transfers to review
            </Link>
          )}
          {alerts.daysSinceImport != null && alerts.daysSinceImport >= 7 && (
            <Link
              to="/import"
              className="shrink-0 rounded-xl border border-caution/30 bg-surface px-3 py-2 font-medium text-ink"
            >
              Last import {alerts.daysSinceImport}d ago
            </Link>
          )}
        </div>
      )}

      {/* FAB — above bottom nav */}
      <button
        type="button"
        onClick={() => navigate('/import')}
        className="fixed bottom-[5.75rem] right-4 z-30 flex min-h-12 items-center gap-2 rounded-full bg-flow px-5 text-sm font-semibold text-white shadow-[var(--glow-flow)] sm:right-[max(1rem,calc(50%-11rem))]"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <span aria-hidden className="text-xl leading-none">
          +
        </span>
        Add expense
      </button>
    </section>
  )
}

function RecentRow({
  txn,
  memberInitial,
  showDivider,
}: {
  txn: DashTxn
  memberInitial: string
  showDivider: boolean
}) {
  const token = txn.categories?.color_token
  const color =
    token && token in COLOR_TOKEN_HEX
      ? COLOR_TOKEN_HEX[token as ColorToken]
      : COLOR_TOKEN_HEX['cat-8']
  const label = txn.merchant || txn.description || 'Transaction'
  const catName = txn.categories?.name ?? ''
  const dateLabel = (() => {
    try {
      return format(parseISO(txn.date), 'd MMM yyyy')
    } catch {
      return txn.date
    }
  })()

  return (
    <li
      className={[
        'flex min-h-14 items-center gap-3 py-3',
        showDivider ? 'border-b border-hairline' : '',
      ].join(' ')}
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${color} 16%, white)` }}
        aria-hidden
      >
        <CategoryGlyph name={catName} color={color} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-ink-muted">{dateLabel}</p>
      </div>
      <p className="money shrink-0 text-sm text-ink">{formatAud(txn.amount)}</p>
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-flow/15 text-xs font-semibold text-flow"
        title="You"
        aria-label="You"
      >
        {memberInitial}
      </div>
    </li>
  )
}

function CategoryGlyph({ name, color }: { name: string; color: string }) {
  const n = name.toLowerCase()
  if (n.includes('food') || n.includes('groc') || n.includes('dining') || n.includes('restaurant')) {
    return <CartIcon color={color} />
  }
  if (n.includes('util') || n.includes('electric') || n.includes('gas') || n.includes('water')) {
    return <BoltIcon color={color} />
  }
  if (n.includes('transport') || n.includes('fuel') || n.includes('car')) {
    return <CarIcon color={color} />
  }
  return <DotIcon color={color} />
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3a5 5 0 0 0-5 5v2.2c0 .7-.2 1.4-.6 2L5 14.5V16h14v-1.5l-1.4-2.3c-.4-.6-.6-1.3-.6-2V8a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function GoalGlyph({ accent }: { accent: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: accent }}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
}

function CartIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6h15l-1.5 9h-12L6 6Zm0 0L5 3H2"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="20" r="1.2" fill={color} />
      <circle cx="17" cy="20" r="1.2" fill={color} />
    </svg>
  )
}

function BoltIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M13 2 4 14h7l-1 8 10-14h-7l0-6Z"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CarIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 16V9.5L7.5 5h9L19 9.5V16M5 16h14M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DotIcon({ color }: { color: string }) {
  return <span className="h-2 w-2 rounded-full" style={{ background: color }} />
}
