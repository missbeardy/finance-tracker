import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TransactionRow } from '@/hooks/useTransactions'
import { UNCATEGORIZED_QUERY_KEY } from '@/hooks/useUncategorizedTransactions'
import { toast } from '@/lib/toastBus'

type CategoryArgs = {
  id: number
  categoryId: number
  applyToMatching?: boolean
  merchant?: string
}

type TxnCache = [readonly unknown[], TransactionRow[] | undefined]

export function useUpdateTransactionCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: CategoryArgs) => {
      if (!supabase) throw new Error('Supabase is not configured')

      if (args.applyToMatching && args.merchant) {
        const { error } = await supabase
          .from('transactions')
          .update({ category_id: args.categoryId, category_source: 'manual' })
          .eq('merchant', args.merchant)
        if (error) throw error
        return
      }

      const { error } = await supabase
        .from('transactions')
        .update({ category_id: args.categoryId, category_source: 'manual' })
        .eq('id', args.id)
      if (error) throw error
    },
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: ['transactions'] })
      await qc.cancelQueries({ queryKey: UNCATEGORIZED_QUERY_KEY })
      const previous = qc.getQueriesData<TransactionRow[]>({ queryKey: ['transactions'] })
      const previousUncat = qc.getQueryData<TransactionRow[]>(UNCATEGORIZED_QUERY_KEY)

      qc.setQueriesData<TransactionRow[]>({ queryKey: ['transactions'] }, (old) => {
        if (!old) return old
        return old.map((row) => {
          const match =
            args.applyToMatching && args.merchant
              ? row.merchant === args.merchant
              : row.id === args.id
          if (!match) return row
          return {
            ...row,
            category_id: args.categoryId,
            category_source: 'manual',
          }
        })
      })

      qc.setQueryData<TransactionRow[]>(UNCATEGORIZED_QUERY_KEY, (old) => {
        if (!old) return old
        return old.filter((row) => {
          const match =
            args.applyToMatching && args.merchant
              ? row.merchant === args.merchant
              : row.id === args.id
          return !match
        })
      })

      return { previous, previousUncat }
    },
    onError: (_err, _args, context) => {
      const previous = context?.previous as TxnCache[] | undefined
      if (previous) {
        for (const [key, data] of previous) {
          qc.setQueryData(key, data)
        }
      }
      if (context?.previousUncat) {
        qc.setQueryData(UNCATEGORIZED_QUERY_KEY, context.previousUncat)
      }
      toast.error('Category update failed — change rolled back')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: UNCATEGORIZED_QUERY_KEY })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    meta: { suppressToast: true },
  })
}
