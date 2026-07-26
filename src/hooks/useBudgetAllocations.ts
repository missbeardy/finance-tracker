import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type BudgetRow = Database['public']['Tables']['budgets']['Row']

export function useBudgetAllocations(periodStart: string, periodType: string) {
  return useQuery({
    queryKey: ['budgets', periodStart, periodType],
    queryFn: async (): Promise<BudgetRow[]> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('period_start', periodStart)
        .eq('period_type', periodType)
      if (error) throw error
      return data
    },
  })
}

export function useSetBudgetAllocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      categoryId: number
      periodStart: string
      periodType: string
      amountCents: number
    }) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('budgets')
        .upsert(
          {
            category_id: args.categoryId,
            period_start: args.periodStart,
            period_type: args.periodType,
            amount: args.amountCents,
          },
          { onConflict: 'user_id,category_id,period_start,period_type' },
        )
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, vars) =>
      void qc.invalidateQueries({ queryKey: ['budgets', vars.periodStart, vars.periodType] }),
  })
}
