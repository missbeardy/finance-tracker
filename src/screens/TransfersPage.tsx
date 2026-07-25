import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatAud } from '@/lib/money'

type TransferTxnLeg = {
  date: string
  amount: number
  accounts: { name: string } | null
}

type PendingTransfer = {
  id: number
  confidence: string
  amount: number
  out_txn_id: number | null
  in_txn_id: number | null
  out_txn: TransferTxnLeg | null
  in_txn: TransferTxnLeg | null
}

function useConfirmTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, confirm }: { id: number; confirm: boolean }) => {
      if (!supabase) throw new Error('Supabase is not configured')

      const { data: transfer, error: fetchError } = await supabase
        .from('transfers')
        .select('out_txn_id, in_txn_id')
        .eq('id', id)
        .single()
      if (fetchError) throw fetchError
      const ids = [transfer.out_txn_id, transfer.in_txn_id].filter(
        (x): x is number => x != null,
      )

      if (confirm) {
        const { data, error } = await supabase
          .from('transfers')
          .update({ status: 'confirmed', confidence: 'high' })
          .eq('id', id)
          .select('id')
        if (error) throw error
        if (!data?.length) throw new Error('Transfer was not found, or you no longer have permission to update it.')

        if (ids.length) {
          const { error: txnError } = await supabase
            .from('transactions')
            .update({ status: 'active' })
            .in('id', ids)
          if (txnError) throw txnError
        }
      } else {
        if (ids.length) {
          const { error: txnError } = await supabase
            .from('transactions')
            .update({ transfer_id: null, status: 'active' })
            .in('id', ids)
          if (txnError) throw txnError
        }
        const { data, error } = await supabase
          .from('transfers')
          .update({ status: 'rejected' })
          .eq('id', id)
          .select('id')
        if (error) throw error
        if (!data?.length) throw new Error('Transfer was not found, or you no longer have permission to update it.')
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transfers'] })
      void qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

function LegCard({ label, tone, leg }: { label: string; tone: 'out' | 'in'; leg: TransferTxnLeg | null }) {
  const toneClass = tone === 'out' ? 'text-outbound' : 'text-inbound'
  return (
    <div className="min-w-0 flex-1 rounded-md border border-hairline bg-paper p-3">
      <p className={`text-[11px] font-medium uppercase tracking-wide ${toneClass}`}>{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-ink">
        {leg?.accounts?.name ?? 'Unknown account'}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">{leg?.date ?? '—'}</p>
      <p className={`money mt-1.5 text-sm ${toneClass}`}>{leg ? formatAud(leg.amount) : '—'}</p>
    </div>
  )
}

export function TransfersPage() {
  const { data: pending = [], isLoading, error } = useQuery({
    queryKey: ['transfers', 'pending'],
    queryFn: async (): Promise<PendingTransfer[]> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data: transfers, error: transfersError } = await supabase
        .from('transfers')
        .select('id, confidence, amount, out_txn_id, in_txn_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (transfersError) throw transfersError

      const txnIds = transfers
        .flatMap((t) => [t.out_txn_id, t.in_txn_id])
        .filter((x): x is number => x != null)

      const txnMap = new Map<number, TransferTxnLeg>()
      if (txnIds.length) {
        const { data: txns, error: txnsError } = await supabase
          .from('transactions')
          .select('id, date, amount, accounts(name)')
          .in('id', txnIds)
        if (txnsError) throw txnsError
        for (const txn of txns as unknown as (TransferTxnLeg & { id: number })[]) {
          txnMap.set(txn.id, txn)
        }
      }

      return transfers.map((t) => ({
        ...t,
        out_txn: t.out_txn_id != null ? (txnMap.get(t.out_txn_id) ?? null) : null,
        in_txn: t.in_txn_id != null ? (txnMap.get(t.in_txn_id) ?? null) : null,
      }))
    },
  })

  const confirmTransfer = useConfirmTransfer()

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">
          Transfers
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Review queue for likely transfers. Confirm or reject after imports.
        </p>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {error && (
        <p className="text-sm text-signal" role="alert">
          {error.message}
        </p>
      )}

      <div className="rounded-lg bg-surface p-4">
        <p className="money text-[44px] leading-none text-ink">{pending.length}</p>
        <p className="mt-2 text-sm text-ink-muted">pending review</p>
      </div>

      <ul className="space-y-3">
        {pending.length === 0 && !isLoading && (
          <li className="text-sm text-ink-muted">
            No transfers need review. Import multi-account CSVs to populate this queue.
          </li>
        )}
        {pending.map((t) => {
          const isPendingAction =
            confirmTransfer.isPending && confirmTransfer.variables?.id === t.id
          return (
            <li key={t.id} className="rounded-lg bg-surface p-4 text-sm">
              <p className="font-medium text-ink">
                Likely transfer · confidence {t.confidence}
              </p>
              <div className="mt-3 flex gap-2">
                <LegCard label="Out" tone="out" leg={t.out_txn} />
                <LegCard label="In" tone="in" leg={t.in_txn} />
              </div>
              {confirmTransfer.isError && confirmTransfer.variables?.id === t.id && (
                <p className="mt-2 text-xs text-signal" role="alert">
                  {confirmTransfer.error instanceof Error
                    ? confirmTransfer.error.message
                    : 'Could not update this transfer.'}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={confirmTransfer.isPending}
                  className="rounded-md bg-flow px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  onClick={() => confirmTransfer.mutate({ id: t.id, confirm: true })}
                >
                  {isPendingAction ? 'Confirming…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  disabled={confirmTransfer.isPending}
                  className="rounded-md border border-hairline px-3 py-1.5 text-xs disabled:opacity-50"
                  onClick={() => confirmTransfer.mutate({ id: t.id, confirm: false })}
                >
                  Not a transfer
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <Link to="/ledger" className="text-xs font-medium text-flow">
        Open ledger
      </Link>
    </section>
  )
}
