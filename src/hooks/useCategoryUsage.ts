import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type CategoryUsage = {
  transactionCount: number
  ruleCount: number
  budgetCount: number
}

/** Per-category reference counts so category cleanup can show what's actually attached before deleting. */
export function useCategoryUsage() {
  return useQuery({
    queryKey: ['category-usage'],
    queryFn: async (): Promise<Record<string, CategoryUsage>> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const [txns, rules, budgets] = await Promise.all([
        supabase.from('transactions').select('category_id'),
        supabase.from('rules').select('category_id'),
        supabase.from('budgets').select('category_id'),
      ])
      if (txns.error) throw txns.error
      if (rules.error) throw rules.error
      if (budgets.error) throw budgets.error

      const usage: Record<string, CategoryUsage> = {}
      const bump = (id: number | null, key: keyof CategoryUsage) => {
        if (id == null) return
        const k = String(id)
        const entry = usage[k] ?? { transactionCount: 0, ruleCount: 0, budgetCount: 0 }
        entry[key] += 1
        usage[k] = entry
      }
      for (const t of txns.data ?? []) bump(t.category_id, 'transactionCount')
      for (const r of rules.data ?? []) bump(r.category_id, 'ruleCount')
      for (const b of budgets.data ?? []) bump(b.category_id, 'budgetCount')
      return usage
    },
  })
}
