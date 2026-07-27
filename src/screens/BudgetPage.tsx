import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { formatAud } from '@/lib/money'
import { rangeForPeriod } from '@/lib/period'
import { discretionaryPool, median, monthlyNormalise } from '@/lib/budget/calc'
import { useSettings } from '@/hooks/useSettings'
import { useCategories, useDeleteCategory, type CategoryRow } from '@/hooks/useCategories'
import { useCategoryUsage } from '@/hooks/useCategoryUsage'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransactions } from '@/hooks/useTransactions'
import { useCommitments } from '@/hooks/useCommitments'
import { useBudgetAllocations, useSetBudgetAllocation } from '@/hooks/useBudgetAllocations'
import { COLOR_TOKEN_HEX, type ColorToken } from '@/lib/accounts'
import { MACRO_GROUPS, macroGroupForParentName, type MacroGroupKey } from '@/lib/budget/macroGroups'
import { CategoryGroupCard, type MicroCategoryLine } from '@/components/CategoryGroupCard'

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
  const { data: usage } = useCategoryUsage()
  const deleteCategory = useDeleteCategory()

  function handleDeleteCategory(id: number, name: string) {
    const txnCount = usage?.get(id)?.transactionCount ?? 0
    const message =
      txnCount > 0
        ? `Delete "${name}"? It has ${txnCount} transaction${txnCount === 1 ? '' : 's'} on file — they'll become uncategorised rather than moved. Use Settings → Categories to merge into another category instead if you want to keep that spending grouped. This can't be undone.`
        : `Delete "${name}"? This can't be undone.`
    if (!window.confirm(message)) return
    deleteCategory.mutate(id)
  }

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
  const overAllocated = totalAllocated > poolCents
  const remainingCents = poolCents - totalAllocated
  const structuralDeficit = poolCents < 0
  const safeToSpendCents = structuralDeficit ? poolCents : remainingCents
  const [showBreakdown, setShowBreakdown] = useState(false)

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

  const macroBuckets = useMemo(() => {
    const buckets = new Map<MacroGroupKey, MicroCategoryLine[]>()
    for (const group of groupedAllocatable) {
      const macroKey = macroGroupForParentName(group.parent.name)
      const lines = buckets.get(macroKey) ?? []
      for (const cat of group.children) {
        lines.push({
          id: cat.id,
          name: cat.name,
          color: catColor(group.parent.color_token),
          allocatedCents: allocCents[cat.id] ?? 0,
          spentCents: spentByCategory.get(cat.id) ?? 0,
        })
      }
      buckets.set(macroKey, lines)
    }
    return (Object.keys(MACRO_GROUPS) as MacroGroupKey[])
      .map((key) => ({ key, meta: MACRO_GROUPS[key], lines: buckets.get(key) ?? [] }))
      .filter((bucket) => bucket.lines.length > 0)
  }, [groupedAllocatable, allocCents, spentByCategory])

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

      {/* Sustainable budget calculation, §7.2 — Safe to Spend leads, breakdown is opt-in */}
      <div className="rounded-lg border border-hairline bg-surface p-4">
        {structuralDeficit ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-signal">Budget shortfall</p>
            <p className="money mt-2 text-[36px] leading-none text-signal">{formatAud(poolCents)}</p>
            <p className="mt-2 text-sm text-ink-muted">
              Commitments, debt minimums and your savings target add up to more than your verified
              income this period. Nothing is safe to allocate until income, commitments or the
              savings target change.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Safe to spend</p>
            <p
              className={[
                'money mt-2 text-[44px] leading-none',
                remainingCents < 0 ? 'text-caution' : 'text-ink',
              ].join(' ')}
            >
              {formatAud(safeToSpendCents)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {remainingCents < 0
                ? `${formatAud(Math.abs(remainingCents))} more allocated than your pool — trim a category below.`
                : `${formatAud(poolCents)} pool · ${formatAud(totalAllocated)} allocated across categories`}
            </p>
          </>
        )}
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          className="mt-3 text-xs font-semibold text-flow"
        >
          {showBreakdown ? 'Hide breakdown ↑' : 'Show breakdown ↓'}
        </button>
        {showBreakdown && (
          <dl className="mt-3 space-y-2 border-t border-hairline pt-3 text-sm">
            <BudgetLine label="Verified income" value={verifiedIncomeCents} positive />
            <BudgetLine label="Committed outflow" value={-committedMonthlyCents} />
            <BudgetLine label="Debt minimums" value={-debtMinimumsMonthlyCents} />
            <BudgetLine label="Savings target" value={-savingsTargetCents} />
            <BudgetLine label="Discretionary pool" value={poolCents} positive={poolCents >= 0} />
            <BudgetLine label="Allocated to categories" value={-totalAllocated} />
          </dl>
        )}
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
        ) : macroBuckets.length === 0 ? (
          <p className="text-sm text-ink-muted">No expense categories to allocate yet.</p>
        ) : (
          <div className="space-y-3">
            {macroBuckets.map((bucket) => (
              <CategoryGroupCard
                key={bucket.key}
                label={bucket.meta.label}
                blurb={bucket.meta.blurb}
                color={catColor(bucket.meta.colorToken)}
                lines={bucket.lines}
                periodStart={range.start}
                periodEnd={range.end}
                today={today}
                onChangeLine={(id, cents) => setAllocCents((prev) => ({ ...prev, [id]: cents }))}
                onSaveLine={(id, cents) =>
                  setAllocation.mutate({
                    categoryId: id,
                    periodStart: range.start,
                    periodType,
                    amountCents: cents,
                  })
                }
                onDeleteLine={(line) => handleDeleteCategory(line.id, line.name)}
              />
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
