import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAccounts } from '@/hooks/useAccounts'
import type { AccountType } from '@/lib/accounts'

export type AccountBalance = {
  accountId: number
  name: string
  type: AccountType
  colorToken: string
  institution: string
  /** Resolved current balance in cents, or null if unknown. */
  balanceCents: number | null
  source: 'statement' | 'computed' | 'opening' | 'unknown'
}

type BalanceStats = { statement: number | null; sum: number }

const LIABILITY_TYPES = new Set<AccountType>(['loan', 'credit_card'])

export function isLiabilityType(type: string): boolean {
  return LIABILITY_TYPES.has(type as AccountType)
}

/**
 * Per-account balance:
 * 1. Latest non-null transaction.balance (bank statement)
 * 2. Else opening_balance + sum(amounts)
 * 3. Else opening_balance alone
 * 4. Else unknown
 *
 * Returns a plain object (not Map) so TanStack Query persistence survives remounts.
 */
export function useAccountBalances() {
  const { data: accounts = [], ...accountsQuery } = useAccounts()

  const balancesQuery = useQuery({
    queryKey: ['account-balances'],
    enabled: accounts.length > 0,
    queryFn: async (): Promise<Record<string, BalanceStats>> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('transactions')
        .select('account_id, amount, balance, date, id')
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .limit(20000)
      if (error) throw error

      const map: Record<string, BalanceStats> = {}
      for (const row of data ?? []) {
        const key = String(row.account_id)
        const cur = map[key] ?? { statement: null, sum: 0 }
        cur.sum += row.amount
        if (cur.statement == null && row.balance != null) {
          cur.statement = row.balance
        }
        map[key] = cur
      }
      return map
    },
  })

  const balances: AccountBalance[] = accounts.map((a) => {
    const stats = balancesQuery.data?.[String(a.id)]
    let balanceCents: number | null = null
    let source: AccountBalance['source'] = 'unknown'

    if (stats?.statement != null) {
      balanceCents = stats.statement
      source = 'statement'
    } else if (a.opening_balance != null && stats) {
      balanceCents = a.opening_balance + stats.sum
      source = 'computed'
    } else if (a.opening_balance != null) {
      balanceCents = a.opening_balance
      source = 'opening'
    }

    return {
      accountId: a.id,
      name: a.name,
      type: a.type as AccountType,
      colorToken: a.color_token,
      institution: a.institution,
      balanceCents,
      source,
    }
  })

  const assetsCents = balances
    .filter((b) => !isLiabilityType(b.type) && b.balanceCents != null)
    .reduce((s, b) => s + (b.balanceCents ?? 0), 0)
  const liabilitiesCents = balances
    .filter((b) => isLiabilityType(b.type) && b.balanceCents != null)
    .reduce((s, b) => s + Math.abs(b.balanceCents ?? 0), 0)
  const netWorthCents =
    balances.some((b) => b.balanceCents != null) ? assetsCents - liabilitiesCents : null

  return {
    balances,
    assetsCents,
    liabilitiesCents,
    netWorthCents,
    isLoading: accountsQuery.isLoading || balancesQuery.isLoading,
    error: accountsQuery.error ?? balancesQuery.error,
    refetch: async () => {
      await accountsQuery.refetch()
      await balancesQuery.refetch()
    },
  }
}
