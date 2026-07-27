import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type CategoryRow = Database['public']['Tables']['categories']['Row']

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CategoryRow[]> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      name: string
      kind: 'expense' | 'income'
      parentId: number | null
      colorToken: string | null
    }): Promise<CategoryRow> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('categories')
        .insert({
          name: args.name,
          kind: args.kind,
          parent_id: args.parentId,
          color_token: args.colorToken,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

function invalidateAfterCategoryChange(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['categories'] })
  void qc.invalidateQueries({ queryKey: ['category-usage'] })
  void qc.invalidateQueries({ queryKey: ['transactions'] })
  void qc.invalidateQueries({ queryKey: ['budgets'] })
}

/** Deletes a category outright. Only safe when it has no transactions, rules, or budgets attached. */
export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: number) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { error } = await supabase.from('categories').delete().eq('id', categoryId)
      if (error) throw error
    },
    onSuccess: () => invalidateAfterCategoryChange(qc),
  })
}

/**
 * Reassigns every transaction and rule pointing at `sourceId` over to `targetId`,
 * then deletes `sourceId` — so merging a redundant category preserves its history
 * instead of `categories_parent_id_fkey`/`transactions_category_id_fkey` silently
 * cascading it away.
 */
export function useMergeCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { sourceId: number; targetId: number }) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { error: txnError } = await supabase
        .from('transactions')
        .update({ category_id: args.targetId })
        .eq('category_id', args.sourceId)
      if (txnError) throw txnError

      const { error: ruleError } = await supabase
        .from('rules')
        .update({ category_id: args.targetId })
        .eq('category_id', args.sourceId)
      if (ruleError) throw ruleError

      const { error: deleteError } = await supabase.from('categories').delete().eq('id', args.sourceId)
      if (deleteError) throw deleteError
    },
    onSuccess: () => invalidateAfterCategoryChange(qc),
  })
}
