import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TransactionRow } from '@/hooks/useTransactions'

export const UNCATEGORIZED_QUERY_KEY = ['uncategorized'] as const

/** Resolve the system "Uncategorised" category id for the current user. */
export async function fetchUncategorisedCategoryId(): Promise<number | null> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('name', 'Uncategorised')
    .is('parent_id', null)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

export function useUncategorizedCount() {
  return useQuery({
    queryKey: [...UNCATEGORIZED_QUERY_KEY, 'count'],
    queryFn: async (): Promise<number> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const uncatId = await fetchUncategorisedCategoryId()
      let q = supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .is('transfer_id', null)
        .neq('status', 'excluded')
      if (uncatId != null) {
        q = q.or(`category_id.is.null,category_id.eq.${uncatId}`)
      } else {
        q = q.is('category_id', null)
      }
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    },
  })
}

/**
 * Uncategorized = null category_id OR the system Uncategorised category.
 * Excludes transfers and excluded rows (same defaults as the ledger).
 */
export function useUncategorizedTransactions() {
  return useQuery({
    queryKey: UNCATEGORIZED_QUERY_KEY,
    queryFn: async (): Promise<TransactionRow[]> => {
      if (!supabase) throw new Error('Supabase is not configured')

      const uncatId = await fetchUncategorisedCategoryId()

      let q = supabase
        .from('transactions')
        .select('*, accounts(name, color_token), categories(name, color_token)')
        .is('transfer_id', null)
        .neq('status', 'excluded')
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .limit(5000)

      if (uncatId != null) {
        q = q.or(`category_id.is.null,category_id.eq.${uncatId}`)
      } else {
        q = q.is('category_id', null)
      }

      const { data, error } = await q
      if (error) throw error
      return data as TransactionRow[]
    },
  })
}
