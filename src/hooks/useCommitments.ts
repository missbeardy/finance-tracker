import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { DetectedCommitment } from '@/lib/budget/recurrence'

export type CommitmentRow = Database['public']['Tables']['commitments']['Row'] & {
  accounts?: { name: string } | null
}
type CommitmentUpdate = Database['public']['Tables']['commitments']['Update']

export function useCommitments() {
  return useQuery({
    queryKey: ['commitments'],
    queryFn: async (): Promise<CommitmentRow[]> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('commitments')
        .select('*, accounts(name)')
        .order('annualised_cents', { ascending: false })
      if (error) throw error
      return data as CommitmentRow[]
    },
  })
}

/**
 * Merge freshly detected commitments into the stored table: insert merchants seen
 * for the first time, refresh amount/cadence/flags on existing ones. A user's
 * 'dismissed' status is never overwritten, and 'confirmed' stays confirmed unless
 * the detector flags it as possibly cancelled or price-increased.
 */
export function useSyncCommitments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (detected: DetectedCommitment[]) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data: existing, error: exErr } = await supabase.from('commitments').select('*')
      if (exErr) throw exErr
      const byMerchant = new Map((existing ?? []).map((c) => [c.merchant.trim().toUpperCase(), c]))

      const inserts: Database['public']['Tables']['commitments']['Insert'][] = []
      const updates: { id: number; patch: CommitmentUpdate }[] = []

      for (const d of detected) {
        const key = d.merchant.trim().toUpperCase()
        const found = byMerchant.get(key)
        const flagStatus = d.possiblyCancelled
          ? 'possibly_cancelled'
          : d.priceIncreased
            ? 'price_increased'
            : null

        if (!found) {
          inserts.push({
            merchant: d.merchant,
            amount: d.amount,
            cadence_days: d.cadenceDays,
            next_expected_date: d.nextExpectedDate,
            account_id: d.accountId,
            annualised_cents: d.annualisedCents,
            status: flagStatus ?? 'detected',
          })
          continue
        }

        if (found.status === 'dismissed') continue

        const nextStatus = flagStatus ?? (found.status === 'confirmed' ? 'confirmed' : 'detected')

        updates.push({
          id: found.id,
          patch: {
            amount: d.amount,
            cadence_days: d.cadenceDays,
            next_expected_date: d.nextExpectedDate,
            account_id: d.accountId,
            annualised_cents: d.annualisedCents,
            status: nextStatus,
          },
        })
      }

      if (inserts.length) {
        const { error } = await supabase.from('commitments').insert(inserts)
        if (error) throw error
      }
      for (const u of updates) {
        const { error } = await supabase.from('commitments').update(u.patch).eq('id', u.id)
        if (error) throw error
      }

      return { inserted: inserts.length, updated: updates.length }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['commitments'] }),
  })
}

export function useUpdateCommitment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: number } & Omit<CommitmentUpdate, 'id'>) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase
        .from('commitments')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['commitments'] }),
  })
}
