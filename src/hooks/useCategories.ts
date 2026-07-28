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
  void qc.invalidateQueries({ queryKey: ['dashboard'] })
  void qc.invalidateQueries({ queryKey: ['uncategorized'] })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      id: number
      name?: string
      colorToken?: string | null
    }): Promise<CategoryRow> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const patch: {
        name?: string
        color_token?: string | null
      } = {}
      if (args.name != null) patch.name = args.name.trim()
      if (args.colorToken !== undefined) patch.color_token = args.colorToken
      const { data, error } = await supabase
        .from('categories')
        .update(patch)
        .eq('id', args.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => invalidateAfterCategoryChange(qc),
  })
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
 * Reassigns every transaction, rule, and budget pointing at `sourceId` over to `targetId`,
 * then deletes `sourceId`.
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

      const { error: budgetError } = await supabase
        .from('budgets')
        .update({ category_id: args.targetId })
        .eq('category_id', args.sourceId)
      if (budgetError) throw budgetError

      const { error: deleteError } = await supabase.from('categories').delete().eq('id', args.sourceId)
      if (deleteError) throw deleteError
    },
    onSuccess: () => invalidateAfterCategoryChange(qc),
  })
}

/**
 * Move every child of `sourceParentId` under `targetParentId`, reassign any usage on the
 * source parent itself into `fallbackCategoryId` (usually a leaf under the target), then
 * delete the empty source parent. Use this to remove a top-level group you don't want.
 */
export function useMergeCategoryGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      sourceParentId: number
      targetParentId: number
      fallbackCategoryId: number
    }) => {
      if (!supabase) throw new Error('Supabase is not configured')

      const { error: reparentError } = await supabase
        .from('categories')
        .update({ parent_id: args.targetParentId })
        .eq('parent_id', args.sourceParentId)
      if (reparentError) throw reparentError

      const { error: txnError } = await supabase
        .from('transactions')
        .update({ category_id: args.fallbackCategoryId })
        .eq('category_id', args.sourceParentId)
      if (txnError) throw txnError

      const { error: ruleError } = await supabase
        .from('rules')
        .update({ category_id: args.fallbackCategoryId })
        .eq('category_id', args.sourceParentId)
      if (ruleError) throw ruleError

      const { error: budgetError } = await supabase
        .from('budgets')
        .update({ category_id: args.fallbackCategoryId })
        .eq('category_id', args.sourceParentId)
      if (budgetError) throw budgetError

      const { error: deleteError } = await supabase
        .from('categories')
        .delete()
        .eq('id', args.sourceParentId)
      if (deleteError) throw deleteError
    },
    onSuccess: () => invalidateAfterCategoryChange(qc),
  })
}

/** Delete a parent and all of its children. Only when none have transactions/rules/budgets. */
export function useDeleteCategoryGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { parentId: number; childIds: number[] }) => {
      if (!supabase) throw new Error('Supabase is not configured')
      if (args.childIds.length) {
        const { error: childError } = await supabase
          .from('categories')
          .delete()
          .in('id', args.childIds)
        if (childError) throw childError
      }
      const { error } = await supabase.from('categories').delete().eq('id', args.parentId)
      if (error) throw error
    },
    onSuccess: () => invalidateAfterCategoryChange(qc),
  })
}
