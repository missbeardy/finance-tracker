import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type MortgageRow = Database['public']['Tables']['mortgages']['Row']
export type MortgageInsert = Database['public']['Tables']['mortgages']['Insert']

export function useMortgages() {
  return useQuery({
    queryKey: ['mortgages'],
    queryFn: async (): Promise<MortgageRow[]> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('mortgages')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useCreateMortgage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<MortgageInsert, 'user_id'>) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase.from('mortgages').insert(input).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['mortgages'] }),
  })
}

export type MortgagePatch = {
  id: number
  name?: string
  lender?: string
  account_id?: number | null
  original_balance?: number
  interest_rate?: number
  term_years?: number
  start_date?: string
}

export function useUpdateMortgage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: MortgagePatch) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('mortgages')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['mortgages'] }),
  })
}

export function useDeleteMortgage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { error } = await supabase.from('mortgages').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['mortgages'] }),
  })
}
