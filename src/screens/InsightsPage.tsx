import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import { format, parseISO, getDay, subMonths, addDays, differenceInCalendarDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { formatAud } from '@/lib/money'
import { Link } from 'react-router-dom'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Cadence = 'fortnightly' | 'monthly'

type RecurringBill = {
  merchant: string
  cadence: Cadence
  amount: number
  nextDueDate: string
  occurrences: number
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Flags merchants charging on a steady ~14 or ~30 day cycle for a similar amount each time. */
function detectRecurringBills(
  spend: { date: string; amount: number; merchant: string }[],
): RecurringBill[] {
  const byMerchant = new Map<string, { date: string; amount: number }[]>()
  for (const t of spend) {
    const list = byMerchant.get(t.merchant) ?? []
    list.push({ date: t.date, amount: Math.abs(t.amount) })
    byMerchant.set(t.merchant, list)
  }

  const results: RecurringBill[] = []
  for (const [merchant, txns] of byMerchant) {
    if (txns.length < 3) continue
    const sorted = txns.slice().sort((a, b) => a.date.localeCompare(b.date))
    const gaps = sorted
      .slice(1)
      .map((t, i) => differenceInCalendarDays(parseISO(t.date), parseISO(sorted[i]!.date)))
    const medianGap = median(gaps)

    let cadence: Cadence | null = null
    if (medianGap >= 25 && medianGap <= 35) cadence = 'monthly'
    else if (medianGap >= 12 && medianGap <= 16) cadence = 'fortnightly'
    if (!cadence) continue

    const target = cadence === 'monthly' ? 30 : 14
    if (Math.max(...gaps) - Math.min(...gaps) > target) continue

    const amounts = sorted.map((t) => t.amount)
    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length
    const maxDelta = Math.max(...amounts.map((a) => Math.abs(a - avgAmount)))
    if (avgAmount === 0 || maxDelta / avgAmount > 0.25) continue

    const lastDate = sorted[sorted.length - 1]!.date
    results.push({
      merchant,
      cadence,
      amount: Math.round(avgAmount),
      nextDueDate: format(addDays(parseISO(lastDate), Math.round(medianGap)), 'yyyy-MM-dd'),
      occurrences: sorted.length,
    })
  }

  return results.sort((a, b) => b.amount - a.amount)
}

export function InsightsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['insights'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase is not configured')
      const sinceStr = format(subMonths(new Date(), 12), 'yyyy-MM-dd')

      const { data: txns, error: txnError } = await supabase
        .from('transactions')
        .select(
          'date, amount, merchant, transfer_id, status, category_id, categories(name, kind)',
        )
        .gte('date', sinceStr)
        .is('transfer_id', null)
        .neq('status', 'excluded')
      if (txnError) throw txnError
      return txns ?? []
    },
  })

  const derived = useMemo(() => {
    const rows = data ?? []
    const spend = rows.filter((t) => t.amount < 0)
    const income = rows.filter((t) => t.amount > 0)
    const byMonth = new Map<string, number>()
    const byMonthIn = new Map<string, number>()
    const byMerchant = new Map<string, { total: number; count: number }>()
    const byWeekday = Array.from({ length: 7 }, () => 0)
    let uncategorised = 0
    let subscriptionAnnual = 0

    for (const t of spend) {
      const month = t.date.slice(0, 7)
      byMonth.set(month, (byMonth.get(month) ?? 0) + Math.abs(t.amount))
      const m = byMerchant.get(t.merchant) ?? { total: 0, count: 0 }
      m.total += Math.abs(t.amount)
      m.count += 1
      byMerchant.set(t.merchant, m)
      byWeekday[getDay(parseISO(t.date))] += Math.abs(t.amount)
      if (!t.category_id || t.categories?.name === 'Uncategorised') {
        uncategorised += Math.abs(t.amount)
      }
      const cat = t.categories?.name?.toLowerCase() ?? ''
      if (
        cat.includes('streaming') ||
        cat.includes('subscription') ||
        cat.includes('software') ||
        cat.includes('membership')
      ) {
        subscriptionAnnual += Math.abs(t.amount)
      }
    }

    for (const t of income) {
      const month = t.date.slice(0, 7)
      byMonthIn.set(month, (byMonthIn.get(month) ?? 0) + t.amount)
    }

    // Rough annualise from observed months
    const months = Math.max(1, byMonth.size)
    subscriptionAnnual = Math.round((subscriptionAnnual / months) * 12)

    const allMonths = new Set([...byMonth.keys(), ...byMonthIn.keys()])
    const inOutTrend = [...allMonths]
      .sort((a, b) => a.localeCompare(b))
      .map((month) => ({
        month,
        label: format(parseISO(`${month}-01`), 'MMM'),
        inCents: byMonthIn.get(month) ?? 0,
        outCents: byMonth.get(month) ?? 0,
      }))

    const thisMonth = format(new Date(), 'yyyy-MM')
    const recurringBills = detectRecurringBills(spend)
    const monthlyBillsTotal = recurringBills.reduce(
      (sum, b) => sum + (b.cadence === 'monthly' ? b.amount : Math.round((b.amount * 30) / 14)),
      0,
    )

    return {
      monthTrend: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, cents]) => ({
          month,
          label: format(parseISO(`${month}-01`), 'MMM'),
          cents,
        })),
      merchants: [...byMerchant.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8),
      weekdays: WEEKDAYS.map((label, i) => ({ label, cents: byWeekday[i] })),
      uncategorised,
      subscriptionAnnual,
      moneyInThisMonth: byMonthIn.get(thisMonth) ?? 0,
      moneyOutThisMonth: byMonth.get(thisMonth) ?? 0,
      inOutTrend,
      recurringBills,
      monthlyBillsTotal,
    }
  }, [data])

  return (
    <section className="space-y-8 pb-4">
      <div>
        <Link to="/" className="text-xs font-medium text-flow">
          ← Dashboard
        </Link>
        <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight text-ink">
          Insights
        </h1>
        <p className="mt-2 text-sm text-ink-muted">Last 12 months of non-transfer spending.</p>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {error && (
        <p className="text-sm text-signal" role="alert">
          {error.message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Money in (this month)</p>
          <p className="money mt-2 text-[28px] text-inbound">{formatAud(derived.moneyInThisMonth)}</p>
        </div>
        <div className="rounded-lg bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Money out (this month)</p>
          <p className="money mt-2 text-[28px] text-outbound">
            {formatAud(derived.moneyOutThisMonth)}
          </p>
        </div>
        <div className="rounded-lg bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Uncategorised</p>
          <p className="money mt-2 text-[28px] text-ink">
            {formatAud(derived.uncategorised)}
          </p>
        </div>
        <div className="rounded-lg bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Subs (annualised)</p>
          <p className="money mt-2 text-[28px] text-ink">
            {formatAud(derived.subscriptionAnnual)}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Recurring bills
          </h2>
          <p className="text-xs text-ink-muted">
            ~{formatAud(derived.monthlyBillsTotal)}/mo
          </p>
        </div>
        <ul className="space-y-2">
          {derived.recurringBills.map((b) => (
            <li
              key={b.merchant}
              className="flex items-center justify-between gap-3 rounded-lg bg-surface p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-ink">{b.merchant}</p>
                <p className="text-[11px] text-ink-muted">
                  {b.cadence === 'monthly' ? 'Monthly' : 'Fortnightly'} · next ~
                  {format(parseISO(b.nextDueDate), 'd MMM')}
                </p>
              </div>
              <p className="ledger-mono shrink-0 text-outbound">{formatAud(b.amount)}</p>
            </li>
          ))}
          {derived.recurringBills.length === 0 && (
            <li className="text-sm text-ink-muted">
              No recurring bills detected yet. Needs at least 3 similar charges from the same
              merchant on a steady cycle.
            </li>
          )}
        </ul>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
          Money in vs money out
        </h2>
        <div className="h-44 rounded-lg bg-surface p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={derived.inOutTrend}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis hide />
              <Tooltip formatter={(v) => formatAud(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar name="In" dataKey="inCents" fill="var(--inbound)" radius={[4, 4, 0, 0]} />
              <Bar name="Out" dataKey="outCents" fill="var(--outbound)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
          Category spend by month
        </h2>
        <div className="h-44 rounded-lg bg-surface p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={derived.monthTrend}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis hide />
              <Tooltip formatter={(v) => formatAud(Number(v))} />
              <Line type="monotone" dataKey="cents" stroke="var(--outbound)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
          Weekday pattern
        </h2>
        <div className="h-40 rounded-lg bg-surface p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={derived.weekdays}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis hide />
              <Tooltip formatter={(v) => formatAud(Number(v))} />
              <Bar dataKey="cents" fill="var(--flow)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
          Merchant leaderboard
        </h2>
        <ul className="space-y-2">
          {derived.merchants.map((m) => (
            <li key={m.name} className="flex items-baseline justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="truncate text-ink">{m.name}</p>
                <p className="text-[11px] text-ink-muted">{m.count}×</p>
              </div>
              <p className="ledger-mono shrink-0 text-ink">{formatAud(m.total)}</p>
            </li>
          ))}
          {derived.merchants.length === 0 && (
            <li className="text-sm text-ink-muted">No spending data yet.</li>
          )}
        </ul>
      </div>
    </section>
  )
}
