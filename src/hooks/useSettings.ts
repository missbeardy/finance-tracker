import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { Json } from '@/types/database'

export type SettingsRow = Database['public']['Tables']['settings']['Row']

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<SettingsRow | null> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data, error } = await supabase.from('settings').select('*').maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: {
      period_type?: string
      payday?: string | null
      savings_target_cents?: number | null
      savings_target_percent?: number | null
      reminder_cadence_days?: number
      import_mappings?: Json
    }) => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data: existing, error: lookupError } = await supabase
        .from('settings')
        .select('id')
        .maybeSingle()
      if (lookupError) throw lookupError
      if (!existing) throw new Error('Settings row missing — reload the app')

      const { data, error } = await supabase
        .from('settings')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}
