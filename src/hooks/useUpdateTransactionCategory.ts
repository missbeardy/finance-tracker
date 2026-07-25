import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useUpdateTransactionCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      id: number
      categoryId: number
      applyToMatching?: boolean
      merchant?: string
    }) => {
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
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}
