import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { formatAud, parseDollarsToCents } from '@/lib/money'
import { rangeForPeriod } from '@/lib/period'
import { discretionaryPool, median, monthlyNormalise, paceDaysDelta } from '@/lib/budget/calc'
import { useSettings } from '@/hooks/useSettings'
import { useCategories, type CategoryRow } from '@/hooks/useCategories'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransactions } from '@/hooks/useTransactions'
import { useCommitments } from '@/hooks/useCommitments'
import { useBudgetAllocations, useSetBudgetAllocation } from '@/hooks/useBudgetAllocations'
import { COLOR_TOKEN_HEX, type ColorToken } from '@/lib/accounts'

type PeriodChoice = 'this_month' | 'pay_cycle'

function catColor(token: string | null | undefined): string {
  if (token && token in COLOR_TOKEN_HEX) return COLOR_TOKEN_HEX[token as ColorToken]
  return COLOR_TOKEN_HEX['cat-8']
}

export function BudgetPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: settings } = useSettings()
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const { data: commitments = [] } = useCommitments()
  const { data: txns = [] } = useTransactions()

  const [periodChoice, setPeriodChoice] = useState<PeriodChoice>('this_month')
  const range = useMemo(
    () => rangeForPeriod(periodChoice, { payday: settings?.payday }),
    [periodChoice, settings?.payday],
  )
  const periodType = periodChoice === 'pay_cycle' ? 'pay_cycle' : 'calendar_month'

  const { data: savedAllocations = [] } = useBudgetAllocations(range.start, periodType)
  const setAllocation = useSetBudgetAllocation()

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accountTypeById = useMemo(() => new Map(accounts.map((a) => [a.id, a.type])), [accounts])

  const verifiedIncomeCents = useMemo(() => {
    return txns
      .filter((t) => t.date >= range.start && t.date <= range.end && t.amount > 0)
      .filter((t) => categoryById.get(t.category_id ?? -1)?.kind === 'income')
      .reduce((sum, t) => sum + t.amount, 0)
  }, [txns, range, categoryById])

  const { committedMonthlyCents, debtMinimumsMonthlyCents, needsReviewCount } = useMemo(() => {
    let committed = 0
    let debt = 0
    let needsReview = 0
    for (const c of commitments) {
      if (c.status === 'dismissed') continue
      if (c.status !== 'confirmed') {
        needsReview += 1
        continue
      }
      const monthly = Math.round(
        (c.annualised_cents ?? monthlyNormalise(c.amount, c.cadence_days) * 12) / 12,
      )
      const accType = c.account_id != null ? accountTypeById.get(c.account_id) : null
      if (accType === 'loan' || accType === 'credit_card') debt += monthly
      else committed += monthly
    }
    return { committedMonthlyCents: committed, debtMinimumsMonthlyCents: debt, needsReviewCount: needsReview }
  }, [commitments, accountTypeById])

  const savingsTargetCents = useMemo(() => {
    if (settings?.savings_target_cents != null) return settings.savings_target_cents
    if (settings?.savings_target_percent != null) {
      return Math.round((verifiedIncomeCents * settings.savings_target_percent) / 100)
    }
    return 0
  }, [settings, verifiedIncomeCents])

  const poolCents = discretionaryPool({
    verifiedIncomeCents,
    committedMonthlyCents,
    debtMinimumsMonthlyCents,
    savingsTargetCents,
  })

  const allocatable = useMemo(
    () => categories.filter((c) => c.kind === 'expense' && c.parent_id != null),
    [categories],
  )
  const parentsById = useMemo(
    () => new Map(categories.filter((c) => c.parent_id == null).map((c) => [c.id, c])),
    [categories],
  )

  const monthKeys = useMemo(() => {
    const anchor = startOfMonth(parseISO(range.start))
    return [1, 2, 3].map((n) => format(subMonths(anchor, n), 'yyyy-MM'))
  }, [range.start])

  const { medianSeedByCategory, spentByCategory } = useMemo(() => {
    const perCatMonth = new Map<string, number>()
    const spent = new Map<number, number>()
    for (const t of txns) {
      if (t.amount >= 0 || t.category_id == null) continue
      if (t.date >= range.start && t.date <= range.end) {
        spent.set(t.category_id, (spent.get(t.category_id) ?? 0) + Math.abs(t.amount))
      }
      const month = t.date.slice(0, 7)
      if (monthKeys.includes(month)) {
        const key = `${t.category_id}:${month}`
        perCatMonth.set(key, (perCatMonth.get(key) ?? 0) + Math.abs(t.amount))
      }
    }
    const seeds = new Map<number, number>()
    for (const cat of allocatable) {
      const values = monthKeys.map((m) => perCatMonth.get(`${cat.id}:${m}`) ?? 0)
      seeds.set(cat.id, median(values))
    }
    return { medianSeedByCategory: seeds, spentByCategory: spent }
  }, [txns, range, monthKeys, allocatable])

  const hydrationKey = `${range.start}:${periodType}`
  const [allocCents, setAllocCents] = useState<Record<number, number>>({})
  const [hydratedFor, setHydratedFor] = useState<string | null>(null)

  useEffect(() => {
    if (hydratedFor === hydrationKey || categories.length === 0) return
    const next: Record<number, number> = {}
    for (const cat of allocatable) {
      const saved = savedAllocations.find((a) => a.category_id === cat.id)
      next[cat.id] = saved?.amount ?? medianSeedByCategory.get(cat.id) ?? 0
    }
    setAllocCents(next)
    setHydratedFor(hydrationKey)
  }, [hydrationKey, hydratedFor, allocatable, savedAllocations, medianSeedByCategory, categories.length])

  const isHydrated = hydratedFor === hydrationKey

  const totalAllocated = useMemo(
    () => Object.values(allocCents).reduce((s, v) => s + v, 0),
    [allocCents],
  )
  const overAllocated = poolCents > 0 && totalAllocated > poolCents
  const remainingCents = poolCents - totalAllocated

  const groupedAllocatable = useMemo(() => {
    const groups = new Map<number, { parent: CategoryRow; children: CategoryRow[] }>()
    for (const cat of allocatable) {
      const parentId = cat.parent_id!
      const parent = parentsById.get(parentId)
      if (!parent) continue
      const g = groups.get(parentId) ?? { parent, children: [] }
      g.children.push(cat)
      groups.set(parentId, g)
    }
    return [...groups.values()].sort((a, b) => a.parent.name.localeCompare(b.parent.name))
  }, [allocatable, parentsById])

  return (
    <section className="space-y-6 pb-4">
      <div>
        <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">Budget</h1>
        <p className="mt-2 max-w-prose text-sm text-ink-muted">
          What's genuinely discretionary, once your commitments and savings are covered.
        </p>
      </div>

      <div
        role="group"
        aria-label="Budget period"
        className="inline-flex rounded-full border border-hairline bg-surface p-1"
      >
        <PeriodButton active={periodChoice === 'this_month'} onClick={() => setPeriodChoice('this_month')}>
          Calendar month
        </PeriodButton>
        <PeriodButton active={periodChoice === 'pay_cycle'} onClick={() => setPeriodChoice('pay_cycle')}>
          Pay cycle
        </PeriodButton>
      </div>
      <p className="-mt-4 text-xs text-ink-muted">{range.label}</p>

      {periodChoice === 'pay_cycle' && !settings?.payday && (
        <p className="text-xs text-caution">
          Set a payday in <Link to="/settings" className="font-semibold underline">Settings</Link>{' '}
          to anchor the pay-cycle period — falling back to calendar month for now.
        </p>
      )}

      {/* Sustainable budget calculation, §7.2 */}
      <div className="rounded-lg border border-hairline bg-surface p-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Discretionary pool</p>
        <p
          className={[
            'money mt-2 text-[44px] leading-none',
            poolCents < 0 ? 'text-signal' : 'text-ink',
          ].join(' ')}
        >
          {formatAud(poolCents)}
        </p>
        <dl className="mt-4 space-y-2 border-t border-hairline pt-4 text-sm">
          <BudgetLine label="Verified income" value={verifiedIncomeCents} positive />
          <BudgetLine label="Committed outflow" value={-committedMonthlyCents} />
          <BudgetLine label="Debt minimums" value={-debtMinimumsMonthlyCents} />
          <BudgetLine label="Savings target" value={-savingsTargetCents} />
        </dl>
      </div>

      <Link
        to="/commitments"
        className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface p-4"
      >
        <div>
          <p className="text-sm font-semibold text-ink">Commitments</p>
          <p className="mt-1 text-xs text-ink-muted">
            {needsReviewCount > 0
              ? `${needsReviewCount} need${needsReviewCount === 1 ? 's' : ''} your review`
              : 'All confirmed'}
          </p>
        </div>
        <span className="text-sm font-semibold text-flow">Manage →</span>
      </Link>

      {/* Allocation builder, §7.2 + §8.6 */}
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Allocate the pool
          </h2>
          <p
            className={['ledger-mono text-xs', overAllocated ? 'font-semibold text-signal' : 'text-ink-muted'].join(
              ' ',
            )}
          >
            {formatAud(totalAllocated)} / {formatAud(poolCents)}
            {overAllocated && ` · ${formatAud(Math.abs(remainingCents))} over`}
          </p>
        </div>

        {!isHydrated ? (
          <p className="text-sm text-ink-muted">Loading allocations…</p>
        ) : groupedAllocatable.length === 0 ? (
          <p className="text-sm text-ink-muted">No expense categories to allocate yet.</p>
        ) : (
          <div className="space-y-5">
            {groupedAllocatable.map((group) => (
              <div key={group.parent.id}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: catColor(group.parent.color_token) }}
                    aria-hidden
                  />
                  <p className="text-sm font-semibold text-ink">{group.parent.name}</p>
                </div>
                <ul className="space-y-2">
                  {group.children.map((cat) => (
                    <AllocationRow
                      key={cat.id}
                      category={cat}
                      color={catColor(group.parent.color_token)}
                      initialCents={allocCents[cat.id] ?? 0}
                      spentCents={spentByCategory.get(cat.id) ?? 0}
                      periodStart={range.start}
                      periodEnd={range.end}
                      today={today}
                      onChange={(cents) => setAllocCents((prev) => ({ ...prev, [cat.id]: cents }))}
                      onSave={(cents) =>
                        setAllocation.mutate({
                          categoryId: cat.id,
                          periodStart: range.start,
                          periodType,
                          amountCents: cents,
                        })
                      }
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function BudgetLine({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={['ledger-mono', positive ? 'text-inbound' : 'text-ink'].join(' ')}>
        {formatAud(value)}
      </dd>
    </div>
  )
}

function PeriodButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'min-h-9 rounded-full px-4 text-xs font-semibold transition-colors duration-120',
        active ? 'bg-flow text-white' : 'text-ink-muted',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function AllocationRow({
  category,
  color,
  initialCents,
  spentCents,
  periodStart,
  periodEnd,
  today,
  onChange,
  onSave,
}: {
  category: CategoryRow
  color: string
  initialCents: number
  spentCents: number
  periodStart: string
  periodEnd: string
  today: string
  onChange: (cents: number) => void
  onSave: (cents: number) => void
}) {
  const [text, setText] = useState((initialCents / 100).toFixed(2))
  const [cents, setCents] = useState(initialCents)

  const pct = cents > 0 ? Math.min(100, Math.round((spentCents / cents) * 100)) : spentCents > 0 ? 100 : 0
  const over = cents > 0 && spentCents > cents
  const pace = paceDaysDelta({ allocationCents: cents, spentCents, periodStart, periodEnd, today })

  return (
    <li className="rounded-lg border border-hairline bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
          <span className="truncate text-sm text-ink">{category.name}</span>
        </div>
        <label className="flex shrink-0 items-center gap-1 text-sm">
          <span className="text-ink-muted">$</span>
          <input
            className="field ledger-mono w-24 text-right"
            inputMode="decimal"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              const parsed = parseDollarsToCents(e.target.value)
              if (parsed != null) {
                setCents(parsed)
                onChange(parsed)
              }
            }}
            onBlur={() => {
              const parsed = parseDollarsToCents(text) ?? 0
              setCents(parsed)
              setText((parsed / 100).toFixed(2))
              onChange(parsed)
              onSave(parsed)
            }}
          />
        </label>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-deep">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.max(pct > 0 ? 4 : 0, pct)}%`, background: over ? 'var(--signal)' : color }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-ink-muted">
        <span>{formatAud(spentCents)} spent</span>
        {pace != null && cents > 0 && (
          <span className={pace < 0 ? 'font-medium text-signal' : ''}>
            {pace === 0 ? 'On pace' : pace > 0 ? `${pace}d ahead of pace` : `${Math.abs(pace)}d behind pace`}
          </span>
        )}
      </div>
    </li>
  )
}
