import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type SavingsGoalRow = Database['public']['Tables']['savings_goals']['Row']

export function useSavingsGoals() {
  return useQuery({
    queryKey: ['savings-goals'],
    staleTime: 60_000,
    queryFn: async (): Promise<SavingsGoalRow[]> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('savings_goals')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useCreateSavingsGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      name: string
      targetCents: number
      currentCents?: number
      targetDate?: string | null
    }) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('savings_goals')
        .insert({
          name: args.name.trim(),
          target_cents: args.targetCents,
          current_cents: args.currentCents ?? 0,
          target_date: args.targetDate ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['savings-goals'] }),
  })
}

export function useUpdateSavingsGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      id: number
      name?: string
      targetCents?: number
      currentCents?: number
      targetDate?: string | null
    }) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('savings_goals')
        .update({
          updated_at: new Date().toISOString(),
          ...(args.name != null ? { name: args.name.trim() } : {}),
          ...(args.targetCents != null ? { target_cents: args.targetCents } : {}),
          ...(args.currentCents != null ? { current_cents: args.currentCents } : {}),
          ...(args.targetDate !== undefined ? { target_date: args.targetDate } : {}),
        })
        .eq('id', args.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['savings-goals'] }),
  })
}

export function useDeleteSavingsGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { error } = await supabase.from('savings_goals').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['savings-goals'] }),
  })
}
