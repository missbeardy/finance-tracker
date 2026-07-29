import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatAud } from '@/lib/money'
import { rangeForPeriod, type PeriodKey } from '@/lib/period'
import { useDashboardData, flowAmount, type CategoryTotal, type DashTxn } from '@/hooks/useDashboardData'
import { useSettings } from '@/hooks/useSettings'
import { QueryError } from '@/components/QueryError'
import { getErrorMessage } from '@/lib/errors'
import { COLOR_TOKEN_HEX } from '@/lib/accounts'
import { categoryEmoji } from '@/lib/categoryEmoji'

const PERIODS: PeriodKey[] = ['this_month', 'last_month', 'last_pay_cycle']
const PIE_SLICE_LIMIT = 7

type FlowMode = 'out' | 'in'

type MerchantRollup = {
  merchant: string
  count: number
  cents: number
}

function rollupByMerchant(txns: DashTxn[]): MerchantRollup[] {
  const map = new Map<string, MerchantRollup>()
  for (const t of txns) {
    const key = t.merchant.trim() || 'Unknown'
    const row = map.get(key) ?? { merchant: key, count: 0, cents: 0 }
    row.count += 1
    row.cents += Math.abs(t.amount)
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents || a.merchant.localeCompare(b.merchant))
}

function buildPieData(categories: CategoryTotal[]) {
  if (categories.length === 0) return []
  if (categories.length <= PIE_SLICE_LIMIT) {
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      cents: c.cents,
      color: c.color,
    }))
  }
  const head = categories.slice(0, PIE_SLICE_LIMIT - 1)
  const rest = categories.slice(PIE_SLICE_LIMIT - 1)
  const otherCents = rest.reduce((s, c) => s + c.cents, 0)
  return [
    ...head.map((c) => ({
      id: c.id,
      name: c.name,
      cents: c.cents,
      color: c.color,
    })),
    {
      id: -999,
      name: 'Other',
      cents: otherCents,
      color: COLOR_TOKEN_HEX['cat-8'],
    },
  ]
}

function periodFromParam(raw: string | null): PeriodKey {
  if (raw && PERIODS.includes(raw as PeriodKey)) return raw as PeriodKey
  return 'this_month'
}

const HEADLINE_MIN_CENTS = 2000
const HEADLINE_MIN_DELTA_PCT = 20
const HEADLINE_MIN_NET_DIFF_CENTS = 2000

type Headline = { text: string; tone: 'caution' | 'inbound' | 'neutral' }

/** Picks the single most notable fact for this period: a big category swing, else the net vs last period. */
function buildHeadline(
  spendByCategory: CategoryTotal[],
  net: number,
  prevNet: number,
): Headline | null {
  const swings = spendByCategory.filter(
    (c) => c.deltaPct != null && c.cents >= HEADLINE_MIN_CENTS && Math.abs(c.deltaPct) >= HEADLINE_MIN_DELTA_PCT,
  )
  if (swings.length > 0) {
    const top = swings.sort(
      (a, b) => Math.abs(b.deltaPct! * b.cents) - Math.abs(a.deltaPct! * a.cents),
    )[0]!
    const up = top.deltaPct! >= 0
    return {
      text: `${top.name} is ${up ? 'up' : 'down'} ${Math.round(Math.abs(top.deltaPct!))}% vs last month`,
      tone: up ? 'caution' : 'inbound',
    }
  }

  if (prevNet !== 0) {
    const diff = net - prevNet
    if (Math.abs(diff) >= HEADLINE_MIN_NET_DIFF_CENTS) {
      return {
        text: `You're ${formatAud(Math.abs(diff))} ${diff >= 0 ? 'ahead of' : 'behind'} last month`,
        tone: diff >= 0 ? 'inbound' : 'caution',
      }
    }
  }

  return null
}

function daysAgoLabel(days: number): string {
  if (days <= 0) return 'Updated today'
  if (days === 1) return 'Updated yesterday'
  return `Updated ${days}d ago`
}

/**
 * Home: money in/out, neon donut by category, expandable merchant rollups.
 */
export function DashboardPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: settings } = useSettings()
  const [period, setPeriod] = useState<PeriodKey>(() =>
    periodFromParam(searchParams.get('period')),
  )
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [flowMode, setFlowMode] = useState<FlowMode>('out')

  const range = useMemo(
    () =>
      rangeForPeriod(period, {
        payday: settings?.payday,
      }),
    [period, settings?.payday],
  )

  const {
    inbound,
    outbound,
    net,
    prevNet,
    spendByCategory,
    incomeByCategory,
    alerts,
    isLoading,
    error,
    refetch,
    data,
  } = useDashboardData(range)

  const cadenceDays = settings?.reminder_cadence_days ?? 14
  const daysSinceImport = alerts?.daysSinceImport ?? null
  const isStale = daysSinceImport != null && daysSinceImport >= cadenceDays
  const headline = useMemo(
    () => (spendByCategory.length > 0 ? buildHeadline(spendByCategory, net, prevNet ?? 0) : null),
    [spendByCategory, net, prevNet],
  )

  const categories = (flowMode === 'out' ? spendByCategory : incomeByCategory) ?? []
  const flowTotal = flowMode === 'out' ? outbound : inbound

  const flowTxns = useMemo(() => {
    const current = data?.current ?? []
    return current.filter((t) => {
      if (t.transfer_id != null) return false
      if (t.status === 'excluded' || t.status === 'pending_transfer_review') return false
      const amount = flowAmount(t)
      return flowMode === 'out' ? amount < 0 : amount > 0
    })
  }, [data?.current, flowMode])

  const txnsByCategory = useMemo(() => {
    const map = new Map<number, DashTxn[]>()
    for (const t of flowTxns) {
      const id = t.category_id ?? -1
      const list = map.get(id) ?? []
      list.push(t)
      map.set(id, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    }
    return map
  }, [flowTxns])

  const pieData = useMemo(() => buildPieData(categories), [categories])

  function setMode(next: FlowMode) {
    if (next === flowMode) return
    setFlowMode(next)
    setExpandedId(null)
  }

  function toggleCategory(id: number) {
    if (id === -999) return
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <section className="-mx-4 -mt-5 pb-16">
      <header
        className="header-hero px-4 pb-8"
        style={{ paddingTop: 'max(1.5rem, calc(env(safe-area-inset-top) + 1.25rem))' }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3 pr-14">
          <div>
            <p className="section-label !text-white/70">Overview</p>
            <h1 className="mt-1 font-display text-[28px] font-semibold tracking-tight text-white">
              Your money
            </h1>
            <p className="mt-1 text-sm text-white/75">
              {range.label}
              {daysSinceImport != null && (
                <span className={isStale ? 'text-white' : undefined}>
                  {' '}
                  · {daysAgoLabel(daysSinceImport)}
                </span>
              )}
            </p>
          </div>
          <label className="sr-only" htmlFor="dash-period">
            Period
          </label>
          <div className="min-h-11 rounded-2xl bg-white/20 backdrop-blur-md">
            <select
              id="dash-period"
              className="min-h-11 rounded-2xl border-0 bg-transparent px-3 text-sm font-semibold text-white outline-none"
              style={{ colorScheme: 'light' }}
              value={period}
              onChange={(e) => {
                const next = e.target.value as PeriodKey
                setPeriod(next)
                setExpandedId(null)
                setSearchParams(next === 'this_month' ? {} : { period: next }, { replace: true })
              }}
            >
              <option value="this_month" style={{ backgroundColor: '#ffffff', color: '#0a0a12' }}>
                This month
              </option>
              <option value="last_month" style={{ backgroundColor: '#ffffff', color: '#0a0a12' }}>
                Last month
              </option>
              <option
                value="last_pay_cycle"
                style={{ backgroundColor: '#ffffff', color: '#0a0a12' }}
              >
                Last pay cycle
              </option>
            </select>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3">
          <div className="rounded-2xl bg-white/15 px-4 py-4 backdrop-blur-md">
            <p className="section-label !text-white/65">Net</p>
            <p
              className={[
                'money mt-2 text-left text-[44px] leading-none',
                net < 0 ? 'text-signal' : 'text-white',
              ].join(' ')}
              aria-label={`Net ${formatAud(net)}`}
            >
              {net >= 0 ? `+${formatAud(net)}` : formatAud(net)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FigureCard
              label="Money in"
              value={inbound}
              tone="in"
              active={flowMode === 'in'}
              onSelect={() => setMode('in')}
              onHero
            />
            <FigureCard
              label="Money out"
              value={outbound}
              tone="out"
              active={flowMode === 'out'}
              onSelect={() => setMode('out')}
              onHero
            />
          </div>
        </div>
      </header>

      <div className="relative z-10 -mt-4 space-y-4 px-4">
        {isLoading && <p className="text-sm text-ink-muted">Loading figures…</p>}
        {error && (
          <QueryError message={getErrorMessage(error)} onRetry={() => void refetch()} />
        )}

        {headline && (
          <p
            className={[
              'card px-4 py-3 text-sm font-medium',
              headline.tone === 'caution'
                ? 'text-caution'
                : headline.tone === 'inbound'
                  ? 'text-inbound'
                  : 'text-ink',
            ].join(' ')}
          >
            {headline.text}
          </p>
        )}

        {(alerts?.uncategorised ?? 0) > 0 && (
          <Link
            to="/review"
            className="card flex min-h-11 items-center justify-between px-4 py-3"
          >
            <span className="text-sm text-ink">
              {alerts!.uncategorised} uncategorised — review to clean this up
            </span>
            <span className="text-sm font-semibold text-flow">Review →</span>
          </Link>
        )}

        {(alerts?.pendingTransfers ?? 0) > 0 && (
          <Link
            to="/transfers"
            className="card flex min-h-11 items-center justify-between px-4 py-3"
          >
            <span className="text-sm text-ink">
              {alerts!.pendingTransfers} transfer{alerts!.pendingTransfers === 1 ? '' : 's'} waiting
              on confirmation
            </span>
            <span className="text-sm font-semibold text-flow">Review →</span>
          </Link>
        )}

        {isStale && (
          <Link
            to="/import"
            className="card flex min-h-11 items-center justify-between px-4 py-3"
          >
            <span className="text-sm text-ink">
              {daysSinceImport} days since your last import — these figures may be out of date
            </span>
            <span className="text-sm font-semibold text-flow">Import →</span>
          </Link>
        )}

        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
            <h2 className="text-base font-semibold text-ink">
              {flowMode === 'out' ? 'Where it went' : 'Where it came from'}
            </h2>
            <div
              className="inline-flex rounded-full bg-paper-deep p-1"
              role="group"
              aria-label="Money direction"
            >
              <button
                type="button"
                onClick={() => setMode('out')}
                className={[
                  'min-h-11 rounded-full px-4 text-sm font-semibold transition-all',
                  flowMode === 'out'
                    ? 'bg-flow text-on-accent shadow-[var(--glow-flow)]'
                    : 'text-ink-muted',
                ].join(' ')}
              >
                Out
              </button>
              <button
                type="button"
                onClick={() => setMode('in')}
                className={[
                  'min-h-11 rounded-full px-4 text-sm font-semibold transition-all',
                  flowMode === 'in'
                    ? 'bg-inbound text-on-accent shadow-[0_0_12px_-4px_rgb(57_255_20_/_0.22)]'
                    : 'text-ink-muted',
                ].join(' ')}
              >
                In
              </button>
            </div>
          </div>

          {!isLoading && categories.length === 0 && (
            <div className="p-4">
              <p className="text-sm text-ink-muted">
                {flowMode === 'out'
                  ? 'No spending in this period yet. Import a CSV to see where money goes.'
                  : 'No money in for this period yet.'}
              </p>
              {flowMode === 'out' && (
                <button
                  type="button"
                  onClick={() => navigate('/import')}
                  className="btn-primary mt-3"
                >
                  Import CSV
                </button>
              )}
            </div>
          )}

          {categories.length > 0 && (
            <>
              <div className="chart-glow relative mx-auto h-52 w-full max-w-xs px-4 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      content={
                        <PieCategoryTooltip totalCents={flowTotal} inbound={flowMode === 'in'} />
                      }
                      trigger="hover"
                      wrapperStyle={{ zIndex: 10, outline: 'none' }}
                    />
                    <Pie
                      data={pieData}
                      dataKey="cents"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="56%"
                      outerRadius="88%"
                      paddingAngle={3}
                      stroke="none"
                      onClick={(_, index) => {
                        const slice = pieData[index]
                        if (slice) toggleCategory(slice.id)
                      }}
                      style={{ cursor: 'pointer', outline: 'none' }}
                    >
                      {pieData.map((entry) => (
                        <Cell
                          key={entry.id}
                          fill={entry.color}
                          style={{
                            filter:
                              expandedId == null ||
                              expandedId === entry.id ||
                              entry.id === -999
                                ? `drop-shadow(0 0 3px ${entry.color})`
                                : undefined,
                            opacity:
                              expandedId == null ||
                              expandedId === entry.id ||
                              entry.id === -999
                                ? 1
                                : 0.28,
                          }}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-2">
                  <p className="section-label">
                    {flowMode === 'out' ? 'Spent' : 'Received'}
                  </p>
                  <p
                    className={[
                      'money mt-1 text-center text-[28px] leading-none',
                      flowMode === 'in' ? 'text-inbound' : 'text-ink',
                    ].join(' ')}
                  >
                    {flowMode === 'in' ? `+${formatAud(flowTotal)}` : formatAud(flowTotal)}
                  </p>
                </div>
              </div>
              <p className="px-4 pb-2 text-center text-xs text-ink-muted">
                Tap a slice or category to see the breakdown
              </p>

              <ul>
                {categories.map((cat) => {
                  const pct = flowTotal > 0 ? Math.round((cat.cents / flowTotal) * 100) : 0
                  const open = expandedId === cat.id
                  const rows = txnsByCategory.get(cat.id) ?? []

                  return (
                    <li key={cat.id} className="border-t border-hairline">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => toggleCategory(cat.id)}
                        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
                      >
                        <span
                          className="emoji-icon"
                          style={{
                            boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.35), 0 0 8px -4px ${cat.color}`,
                          }}
                          aria-hidden
                        >
                          {categoryEmoji(cat.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">
                            {cat.name}
                          </span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-paper-deep">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.max(pct > 0 ? 4 : 0, pct)}%`,
                                background: cat.color,
                                boxShadow: `0 0 5px ${cat.color}`,
                              }}
                            />
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span
                            className={[
                              'money block text-[16px] leading-none',
                              flowMode === 'in' ? 'text-inbound' : 'text-ink',
                            ].join(' ')}
                          >
                            {flowMode === 'in' ? `+${formatAud(cat.cents)}` : formatAud(cat.cents)}
                          </span>
                          <span className="ledger-mono mt-1 block text-xs text-ink-muted">
                            {pct}%
                          </span>
                          {cat.deltaPct != null && Math.round(Math.abs(cat.deltaPct)) > 0 && (
                            <span
                              className={[
                                'mt-0.5 block text-[11px]',
                                cat.deltaPct >= 0
                                  ? flowMode === 'out'
                                    ? 'text-caution'
                                    : 'text-inbound'
                                  : flowMode === 'out'
                                    ? 'text-inbound'
                                    : 'text-caution',
                              ].join(' ')}
                            >
                              {cat.deltaPct >= 0 ? '+' : ''}
                              {Math.round(cat.deltaPct)}% vs last mo
                            </span>
                          )}
                        </span>
                      </button>

                      {open && (
                        <div className="bg-paper-deep/60">
                          {rows.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-ink-muted">No transactions.</p>
                          ) : (
                            <ul>
                              {rollupByMerchant(rows).map((m) => (
                                <li
                                  key={m.merchant}
                                  className="flex min-h-14 items-center gap-3 border-t border-hairline px-4 py-3"
                                >
                                  <div className="min-w-0 flex-1 pl-2">
                                    <p className="truncate text-sm font-medium text-ink">
                                      {m.merchant}
                                      {m.count > 1 ? (
                                        <span className="font-normal text-ink-muted">
                                          {' '}
                                          ({m.count} times)
                                        </span>
                                      ) : null}
                                    </p>
                                  </div>
                                  <p
                                    className={[
                                      'ledger-mono shrink-0 text-sm',
                                      flowMode === 'in' ? 'text-inbound' : 'text-ink',
                                    ].join(' ')}
                                  >
                                    {flowMode === 'in'
                                      ? `+${formatAud(m.cents)}`
                                      : formatAud(-m.cents)}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                          {(cat.id === -1 || cat.name === 'Uncategorised') && (
                            <div className="border-t border-hairline px-4 py-3">
                              <Link to="/review" className="text-sm font-semibold text-flow">
                                Review & categorise →
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-3 pb-4 text-sm">
          <Link
            to="/ledger"
            className="inline-flex min-h-11 items-center rounded-2xl bg-surface px-4 font-semibold text-flow shadow-[var(--card-shadow)]"
          >
            Full ledger →
          </Link>
          <Link
            to="/insights"
            className="inline-flex min-h-11 items-center rounded-2xl bg-surface px-4 font-semibold text-flow shadow-[var(--card-shadow)]"
          >
            Trends →
          </Link>
        </div>
      </div>
    </section>
  )
}

function FigureCard({
  label,
  value,
  tone,
  active,
  onSelect,
  onHero,
}: {
  label: string
  value: number
  tone: 'in' | 'out' | 'neutral'
  active?: boolean
  onSelect?: () => void
  onHero?: boolean
}) {
  const valueColor = onHero
    ? 'text-white'
    : tone === 'in'
      ? 'text-inbound'
      : 'text-ink'

  const inner = (
    <>
      <p className={['section-label', onHero ? '!text-white/65' : ''].join(' ')}>{label}</p>
      <p className={['money mt-2 text-left text-[20px] leading-none sm:text-[28px]', valueColor].join(' ')}>
        {tone === 'in' && value > 0 ? `+${formatAud(value)}` : formatAud(value)}
      </p>
    </>
  )

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={[
          'min-h-16 w-full rounded-2xl px-3 py-4 text-left transition-all',
          onHero
            ? active
              ? 'bg-white/25 ring-2 ring-white/70'
              : 'bg-white/12'
            : active
              ? 'card ring-2 ring-flow'
              : 'card',
        ].join(' ')}
      >
        {inner}
      </button>
    )
  }

  return <div className="card px-3 py-4">{inner}</div>
}

type PieTooltipProps = {
  active?: boolean
  payload?: Array<{
    name?: string
    value?: number
    payload?: { name: string; cents: number; color: string }
  }>
  totalCents: number
  inbound?: boolean
}

function PieCategoryTooltip({ active, payload, totalCents, inbound }: PieTooltipProps) {
  if (!active || !payload?.length) return null
  const item = payload[0]?.payload
  if (!item) return null
  const pct = totalCents > 0 ? Math.round((item.cents / totalCents) * 100) : 0

  return (
    <div className="card px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="emoji-icon !h-8 !w-8 !text-[14px]" aria-hidden>
          {categoryEmoji(item.name)}
        </span>
        <p className="max-w-[10rem] truncate text-sm font-medium text-ink">{item.name}</p>
      </div>
      <p
        className={[
          'ledger-mono mt-1 text-right text-sm',
          inbound ? 'text-inbound' : 'text-ink',
        ].join(' ')}
      >
        {inbound ? `+${formatAud(item.cents)}` : formatAud(item.cents)}
      </p>
      <p className="mt-1 text-right text-xs text-ink-muted">
        {pct}% of {inbound ? 'income' : 'spending'}
      </p>
    </div>
  )
}
