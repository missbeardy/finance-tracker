import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { matchCategory, type CategoriseRule } from '@/lib/ledger/categorise'
import { fetchUncategorisedCategoryId, UNCATEGORIZED_QUERY_KEY } from '@/hooks/useUncategorizedTransactions'
import { toast } from '@/lib/toastBus'
import type { TransactionRow } from '@/hooks/useTransactions'

export type RuleRow = Database['public']['Tables']['rules']['Row']

function invalidateCategorisation(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: UNCATEGORIZED_QUERY_KEY })
  void qc.invalidateQueries({ queryKey: ['transactions'] })
  void qc.invalidateQueries({ queryKey: ['dashboard'] })
  void qc.invalidateQueries({ queryKey: ['category-usage'] })
  void qc.invalidateQueries({ queryKey: ['rules'] })
}

export function useRules() {
  return useQuery({
    queryKey: ['rules'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RuleRow[]> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('rules')
        .select('*')
        .order('priority', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

function toCategoriseRules(rows: RuleRow[]): CategoriseRule[] {
  return rows.map((r) => ({
    id: r.id,
    priority: r.priority,
    matchType: r.match_type as CategoriseRule['matchType'],
    pattern: r.pattern,
    accountScope: r.account_scope,
    amountMin: r.amount_min,
    amountMax: r.amount_max,
    categoryId: r.category_id,
    enabled: r.enabled,
  }))
}

export function useCreateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      pattern: string
      categoryId: number
      matchType?: CategoriseRule['matchType']
      priority?: number
    }): Promise<RuleRow> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('rules')
        .insert({
          pattern: args.pattern.trim(),
          category_id: args.categoryId,
          match_type: args.matchType ?? 'contains',
          priority: args.priority ?? 100,
          enabled: true,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rules'] })
      toast.success('Rule saved')
    },
  })
}

export type ApplyRulesPreview = {
  wouldUpdate: number
  byCategory: Map<number, number[]>
}

/** Preview how many uncategorized txns would match enabled rules (client-side, same as import). */
export async function previewApplyRulesToUncategorized(
  rows: TransactionRow[],
  ruleRows: RuleRow[],
): Promise<ApplyRulesPreview> {
  const rules = toCategoriseRules(ruleRows).filter((r) => r.enabled)
  const byCategory = new Map<number, number[]>()
  let wouldUpdate = 0

  for (const row of rows) {
    const matched = matchCategory(
      {
        merchant: row.merchant,
        description: row.description,
        accountId: row.account_id,
        amount: row.amount,
      },
      rules,
    )
    if (!matched) continue
    wouldUpdate += 1
    const list = byCategory.get(matched.categoryId) ?? []
    list.push(row.id)
    byCategory.set(matched.categoryId, list)
  }

  return { wouldUpdate, byCategory }
}

export function useApplyRulesToUncategorized() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      rows: TransactionRow[]
      rules: RuleRow[]
      /** When set, only apply this one rule (still scoped to the provided rows). */
      ruleId?: number
    }) => {
      if (!supabase) throw new Error('Supabase is not configured')

      let ruleRows = args.rules.filter((r) => r.enabled)
      if (args.ruleId != null) {
        ruleRows = ruleRows.filter((r) => r.id === args.ruleId)
      }

      const preview = await previewApplyRulesToUncategorized(args.rows, ruleRows)
      if (preview.wouldUpdate === 0) {
        return { updated: 0 }
      }

      const BATCH = 200
      let updated = 0

      for (const [categoryId, ids] of preview.byCategory) {
        for (let i = 0; i < ids.length; i += BATCH) {
          const chunk = ids.slice(i, i + BATCH)
          const { error } = await supabase
            .from('transactions')
            .update({ category_id: categoryId, category_source: 'rule' })
            .in('id', chunk)
          if (error) throw error
          updated += chunk.length
        }
      }

      await supabase.from('audit_log').insert({
        action: args.ruleId != null ? 'apply_rule' : 'apply_rules_batch',
        entity_type: 'rules',
        entity_id: args.ruleId != null ? String(args.ruleId) : null,
        payload: {
          scope: 'uncategorized',
          updated,
          rule_id: args.ruleId ?? null,
        },
      }).then(({ error: auditErr }) => {
        if (auditErr) {
          // Table may not be migrated yet on older remotes — categorisation still succeeded.
          console.warn('[audit_log] insert skipped:', auditErr.message)
        }
      })

      return { updated }
    },
    onSuccess: (result) => {
      invalidateCategorisation(qc)
      toast.success(
        result.updated > 0
          ? `Categorised ${result.updated} transaction${result.updated === 1 ? '' : 's'}`
          : 'No matching transactions',
      )
    },
  })
}

export function useBulkUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { ids: number[]; categoryId: number }) => {
      if (!supabase) throw new Error('Supabase is not configured')
      if (args.ids.length === 0) return

      const BATCH = 200
      for (let i = 0; i < args.ids.length; i += BATCH) {
        const chunk = args.ids.slice(i, i + BATCH)
        const { error } = await supabase
          .from('transactions')
          .update({ category_id: args.categoryId, category_source: 'manual' })
          .in('id', chunk)
        if (error) throw error
      }
    },
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: UNCATEGORIZED_QUERY_KEY })
      const previous = qc.getQueryData<TransactionRow[]>(UNCATEGORIZED_QUERY_KEY)

      const uncatId = await fetchUncategorisedCategoryId().catch(() => null)
      qc.setQueryData<TransactionRow[]>(UNCATEGORIZED_QUERY_KEY, (old) => {
        if (!old) return old
        const idSet = new Set(args.ids)
        return old.filter((row) => {
          if (!idSet.has(row.id)) return true
          // Leaving the queue once assigned away from Uncategorised/null
          return args.categoryId === uncatId
        })
      })

      return { previous }
    },
    onError: (_err, _args, context) => {
      if (context?.previous) {
        qc.setQueryData(UNCATEGORIZED_QUERY_KEY, context.previous)
      }
      toast.error('Bulk category update failed — rolled back')
    },
    onSettled: () => invalidateCategorisation(qc),
    meta: { suppressToast: true },
  })
}
