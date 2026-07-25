import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type TransactionRow = Database['public']['Tables']['transactions']['Row'] & {
  accounts?: { name: string; color_token: string } | null
  categories?: { name: string; color_token: string | null } | null
}

export type TransactionFilters = {
  accountId?: number | null
  categoryId?: number | null
  search?: string
  showTransfers?: boolean
  showExcluded?: boolean
}

export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: async (): Promise<TransactionRow[]> => {
      if (!supabase) throw new Error('Supabase is not configured')
      let q = supabase
        .from('transactions')
        .select('*, accounts(name, color_token), categories(name, color_token)')
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .limit(5000)

      if (filters.accountId) q = q.eq('account_id', filters.accountId)
      if (filters.categoryId) q = q.eq('category_id', filters.categoryId)
      if (!filters.showTransfers) q = q.is('transfer_id', null)
      if (!filters.showExcluded) q = q.neq('status', 'excluded')
      if (filters.search?.trim()) {
        const term = filters.search.trim().replace(/[%_,]/g, '')
        q = q.or(`merchant.ilike.%${term}%,description.ilike.%${term}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as TransactionRow[]
    },
  })
}

export function useImports() {
  return useQuery({
    queryKey: ['imports'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('imports')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}
