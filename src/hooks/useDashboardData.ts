import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { previousRange, type DateRange } from '@/lib/period'
import { COLOR_TOKEN_HEX, type ColorToken } from '@/lib/accounts'

export type DashTxn = {
  id: number
  date: string
  amount: number
  merchant: string
  description: string
  account_id: number
  category_id: number | null
  transfer_id: number | null
  status: string
  accounts: { name: string; color_token: string } | null
  categories: {
    name: string
    kind: string
    color_token: string | null
    parent_id: number | null
    is_opaque: boolean
  } | null
}

export type CategoryTotal = {
  id: number
  name: string
  color: string
  cents: number
  prevCents: number
  deltaPct: number | null
}

export type SankeyLink = {
  source: string
  target: string
  value: number
  kind: 'income' | 'spend' | 'transfer'
}

function isSpending(txn: DashTxn) {
  if (txn.transfer_id != null) return false
  if (txn.status === 'excluded' || txn.status === 'pending_transfer_review') return false
  return true
}

/** Cash taken out of the account to spend — never income, always money out. */
export function isCashWithdrawal(txn: DashTxn): boolean {
  return txn.categories?.name === 'Cash Withdrawal' || txn.categories?.is_opaque === true
}

/**
 * Signed amount for cashflow views. Cash withdrawals are forced negative
 * even if a bank feed stored them as positive.
 */
export function flowAmount(txn: DashTxn): number {
  if (isCashWithdrawal(txn)) return -Math.abs(txn.amount)
  return txn.amount
}

function catColor(token: string | null | undefined): string {
  if (token && token in COLOR_TOKEN_HEX) {
    return COLOR_TOKEN_HEX[token as ColorToken]
  }
  return COLOR_TOKEN_HEX['cat-8']
}

export function useDashboardData(range: DateRange) {
  const prev = useMemo(() => previousRange(range), [range])

  const query = useQuery({
    queryKey: ['dashboard', range.start, range.end, prev.start, prev.end],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase is not configured')

      const [{ data: current, error: e1 }, { data: previous, error: e2 }, alerts] =
        await Promise.all([
          supabase
            .from('transactions')
            .select(
              'id, date, amount, merchant, description, account_id, category_id, transfer_id, status, accounts(name, color_token), categories(name, kind, color_token, parent_id, is_opaque)',
            )
            .gte('date', range.start)
            .lte('date', range.end)
            .order('date', { ascending: true }),
          supabase
            .from('transactions')
            .select(
              'id, date, amount, merchant, description, account_id, category_id, transfer_id, status, accounts(name, color_token), categories(name, kind, color_token, parent_id, is_opaque)',
            )
            .gte('date', prev.start)
            .lte('date', prev.end),
          loadAlerts(),
        ])

      if (e1) throw e1
      if (e2) throw e2

      return {
        current: (current ?? []) as unknown as DashTxn[],
        previous: (previous ?? []) as unknown as DashTxn[],
        alerts,
      }
    },
  })

  const stats = useMemo(() => {
    const current = query.data?.current ?? []
    const previous = query.data?.previous ?? []
    const live = current.filter(isSpending)
    const livePrev = previous.filter(isSpending)

    let inbound = 0
    let outbound = 0
    for (const t of live) {
      const amount = flowAmount(t)
      if (amount > 0) inbound += amount
      else outbound += Math.abs(amount)
    }
    const net = inbound - outbound

    let prevNet = 0
    for (const t of livePrev) {
      prevNet += flowAmount(t)
    }

    const byCat = new Map<number, CategoryTotal>()
    const byIncomeCat = new Map<number, CategoryTotal>()
    for (const t of live) {
      const amount = flowAmount(t)
      if (amount >= 0) continue
      const id = t.category_id ?? -1
      const name = t.categories?.name ?? 'Uncategorised'
      const color = catColor(t.categories?.color_token)
      const row = byCat.get(id) ?? {
        id,
        name,
        color,
        cents: 0,
        prevCents: 0,
        deltaPct: null,
      }
      row.cents += Math.abs(amount)
      byCat.set(id, row)
    }
    for (const t of live) {
      const amount = flowAmount(t)
      if (amount <= 0) continue
      const id = t.category_id ?? -1
      const name = t.categories?.name ?? 'Uncategorised'
      const color = catColor(t.categories?.color_token)
      const row = byIncomeCat.get(id) ?? {
        id,
        name,
        color,
        cents: 0,
        prevCents: 0,
        deltaPct: null,
      }
      row.cents += amount
      byIncomeCat.set(id, row)
    }
    for (const t of previous.filter(isSpending)) {
      const amount = flowAmount(t)
      if (amount >= 0) continue
      const id = t.category_id ?? -1
      const row = byCat.get(id)
      if (row) row.prevCents += Math.abs(amount)
    }
    for (const row of byCat.values()) {
      if (row.prevCents > 0) {
        row.deltaPct = ((row.cents - row.prevCents) / row.prevCents) * 100
      }
    }

    const topCategories = [...byCat.values()]
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 5)

    const spendByCategory = [...byCat.values()].sort((a, b) => b.cents - a.cents)
    const incomeByCategory = [...byIncomeCat.values()].sort((a, b) => b.cents - a.cents)

    const sankey = buildSankeyLinks(live)
    const netSeries = buildNetSeries(live, range)

    return {
      inbound,
      outbound,
      net,
      prevNet,
      discretionary: net,
      topCategories,
      spendByCategory,
      incomeByCategory,
      sankey,
      netSeries,
    }
  }, [query.data, range])

  return { ...query, ...stats, alerts: query.data?.alerts }
}

async function loadAlerts() {
  if (!supabase) {
    return { uncategorised: 0, pendingTransfers: 0, daysSinceImport: null as number | null }
  }

  const [{ data: uncatCat }, { count: pendingTransfers }, { data: lastImport }] =
    await Promise.all([
      supabase
        .from('categories')
        .select('id')
        .eq('name', 'Uncategorised')
        .is('parent_id', null)
        .maybeSingle(),
      supabase
        .from('transfers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('imports')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  let uncategorised = 0
  if (uncatCat?.id) {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .is('transfer_id', null)
      .or(`category_id.is.null,category_id.eq.${uncatCat.id}`)
    uncategorised = count ?? 0
  } else {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .is('transfer_id', null)
      .is('category_id', null)
    uncategorised = count ?? 0
  }

  let daysSinceImport: number | null = null
  if (lastImport?.created_at) {
    const ms = Date.now() - new Date(lastImport.created_at).getTime()
    daysSinceImport = Math.floor(ms / (1000 * 60 * 60 * 24))
  }

  return {
    uncategorised,
    pendingTransfers: pendingTransfers ?? 0,
    daysSinceImport,
  }
}

function buildSankeyLinks(txns: DashTxn[]): SankeyLink[] {
  const links = new Map<string, SankeyLink>()

  function add(source: string, target: string, value: number, kind: SankeyLink['kind']) {
    if (value <= 0) return
    const key = `${kind}:${source}->${target}`
    const existing = links.get(key)
    if (existing) existing.value += value
    else links.set(key, { source, target, value, kind })
  }

  for (const t of txns) {
    const account = t.accounts?.name ?? 'Account'
    if (t.transfer_id != null) {
      // Show transfer volume as neutral flow account→Transfers
      if (t.amount < 0) add(account, 'Internal transfers', Math.abs(t.amount), 'transfer')
      continue
    }
    if (t.status === 'excluded') continue

    const amount = flowAmount(t)
    if (amount > 0) {
      const source =
        t.categories?.kind === 'income'
          ? t.categories.name
          : t.merchant || 'Income'
      add(`in:${source}`, account, amount, 'income')
    } else {
      const cat = t.categories?.name ?? 'Uncategorised'
      add(account, `out:${cat}`, Math.abs(amount), 'spend')
    }
  }

  return [...links.values()].filter((l) => l.value > 0)
}

function buildNetSeries(txns: DashTxn[], range: DateRange) {
  const byDay = new Map<string, number>()
  let cursor = range.start
  while (cursor <= range.end) {
    byDay.set(cursor, 0)
    cursor = format(addDays(parseISO(cursor), 1), 'yyyy-MM-dd')
  }
  let running = 0
  const points: { date: string; net: number }[] = []
  for (const day of [...byDay.keys()].sort()) {
    const dayTxns = txns.filter((t) => t.date === day && isSpending(t))
    for (const t of dayTxns) running += flowAmount(t)
    points.push({ date: day, net: running })
  }
  return points
}
