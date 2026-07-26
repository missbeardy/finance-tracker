import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Manually flags a single transaction as a transfer leg. Creates a one-sided
 * `transfers` row (the matching leg is unknown or wasn't imported) so the
 * existing transfer_id-based filtering — Ledger's "Show transfers", dashboard
 * spend totals, Insights — hides it consistently everywhere.
 */
export function useMarkAsTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      transactionId: number
      accountId: number
      amount: number
      categoryId?: number | null
    }) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const isOut = args.amount < 0

      const { data: transfer, error: transferError } = await supabase
        .from('transfers')
        .insert({
          out_txn_id: isOut ? args.transactionId : null,
          in_txn_id: isOut ? null : args.transactionId,
          account_out_id: isOut ? args.accountId : null,
          account_in_id: isOut ? null : args.accountId,
          amount: Math.abs(args.amount),
          status: 'confirmed',
          confidence: 'high',
          method: 'manual',
        })
        .select('id')
        .single()
      if (transferError) throw transferError

      const { error: txnError } = await supabase
        .from('transactions')
        .update({
          transfer_id: transfer.id,
          ...(args.categoryId != null
            ? { category_id: args.categoryId, category_source: 'manual' }
            : {}),
        })
        .eq('id', args.transactionId)
      if (txnError) throw txnError
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: ['transfers'] })
    },
  })
}
