import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function TransfersPage() {
  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['transfers', 'pending'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('transfers')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

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

      <div className="rounded-lg bg-surface p-4">
        <p className="money text-[44px] leading-none text-ink">{pending.length}</p>
        <p className="mt-2 text-sm text-ink-muted">pending review</p>
      </div>

      <ul className="space-y-3">
        {pending.length === 0 && (
          <li className="text-sm text-ink-muted">
            No transfers need review. Import multi-account CSVs to populate this queue.
          </li>
        )}
        {pending.map((t) => (
          <li key={t.id} className="rounded-lg bg-surface p-4 text-sm">
            <p className="font-medium text-ink">
              Likely transfer · confidence {t.confidence}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Out #{t.out_txn_id} → In #{t.in_txn_id} · {(t.amount / 100).toFixed(2)}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded-md bg-flow px-3 py-1.5 text-xs font-medium text-white"
                onClick={() => void confirmTransfer(t.id, true)}
              >
                Confirm
              </button>
              <button
                type="button"
                className="rounded-md border border-hairline px-3 py-1.5 text-xs"
                onClick={() => void confirmTransfer(t.id, false)}
              >
                Not a transfer
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Link to="/ledger" className="text-xs font-medium text-flow">
        Open ledger
      </Link>
    </section>
  )
}

async function confirmTransfer(id: number, confirm: boolean) {
  if (!supabase) return
  if (confirm) {
    await supabase.from('transfers').update({ status: 'confirmed', confidence: 'high' }).eq('id', id)
    const { data } = await supabase
      .from('transfers')
      .select('out_txn_id, in_txn_id')
      .eq('id', id)
      .single()
    if (data) {
      const ids = [data.out_txn_id, data.in_txn_id].filter((x): x is number => x != null)
      await supabase.from('transactions').update({ status: 'active' }).in('id', ids)
    }
  } else {
    const { data } = await supabase
      .from('transfers')
      .select('out_txn_id, in_txn_id')
      .eq('id', id)
      .single()
    if (data) {
      const ids = [data.out_txn_id, data.in_txn_id].filter((x): x is number => x != null)
      await supabase
        .from('transactions')
        .update({ transfer_id: null, status: 'active' })
        .in('id', ids)
    }
    await supabase.from('transfers').update({ status: 'rejected' }).eq('id', id)
  }
  window.location.reload()
}
