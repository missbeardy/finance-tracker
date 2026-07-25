import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import { format, parseISO, getDay, subMonths } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { formatAud } from '@/lib/money'
import { Link } from 'react-router-dom'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
    const byMonth = new Map<string, number>()
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

    // Rough annualise from observed months
    const months = Math.max(1, byMonth.size)
    subscriptionAnnual = Math.round((subscriptionAnnual / months) * 12)

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
