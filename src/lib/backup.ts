import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { Json } from '@/types/database'

const BACKUP_VERSION = 1 as const

type AccountRow = Database['public']['Tables']['accounts']['Row']
type CategoryRow = Database['public']['Tables']['categories']['Row']
type SettingsRow = Database['public']['Tables']['settings']['Row']
type RuleRow = Database['public']['Tables']['rules']['Row']
type MerchantAliasRow = Database['public']['Tables']['merchant_aliases']['Row']
type CommitmentRow = Database['public']['Tables']['commitments']['Row']
type BudgetRow = Database['public']['Tables']['budgets']['Row']
type ImportRow = Database['public']['Tables']['imports']['Row']
type TransferRow = Database['public']['Tables']['transfers']['Row']
type TransactionRow = Database['public']['Tables']['transactions']['Row']

export type LedgerBackup = {
  version: typeof BACKUP_VERSION
  exportedAt: string
  accounts: AccountRow[]
  categories: CategoryRow[]
  settings: SettingsRow | null
  rules: RuleRow[]
  merchant_aliases: MerchantAliasRow[]
  commitments: CommitmentRow[]
  budgets: BudgetRow[]
  imports: ImportRow[]
  transfers: TransferRow[]
  transactions: TransactionRow[]
}

async function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export async function exportLedgerBackup(): Promise<LedgerBackup> {
  const client = await requireClient()

  const [
    accounts,
    categories,
    settings,
    rules,
    merchant_aliases,
    commitments,
    budgets,
    imports,
    transfers,
    transactions,
  ] = await Promise.all([
    client.from('accounts').select('*'),
    client.from('categories').select('*'),
    client.from('settings').select('*').maybeSingle(),
    client.from('rules').select('*'),
    client.from('merchant_aliases').select('*'),
    client.from('commitments').select('*'),
    client.from('budgets').select('*'),
    client.from('imports').select('*'),
    client.from('transfers').select('*'),
    client.from('transactions').select('*'),
  ])

  for (const result of [
    accounts,
    categories,
    rules,
    merchant_aliases,
    commitments,
    budgets,
    imports,
    transfers,
    transactions,
  ]) {
    if (result.error) throw result.error
  }
  if (settings.error) throw settings.error

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
    settings: settings.data,
    rules: rules.data ?? [],
    merchant_aliases: merchant_aliases.data ?? [],
    commitments: commitments.data ?? [],
    budgets: budgets.data ?? [],
    imports: imports.data ?? [],
    transfers: transfers.data ?? [],
    transactions: transactions.data ?? [],
  }
}

export function downloadBackupJson(backup: LedgerBackup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `randall-finance-backup-${backup.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Restore Phase 1 tables (accounts, categories, settings, rules, aliases, commitments, budgets).
 * Transactions/imports/transfers require identity remapping and land in a later restore path.
 */
export async function restorePhase1Backup(backup: LedgerBackup): Promise<{ restored: string[] }> {
  const client = await requireClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) throw new Error('Sign in before restoring a backup')

  if (backup.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${String(backup.version)}`)
  }

  const restored: string[] = []

  // Wipe Phase 1 rows for this user (children first where FKs require it)
  await client.from('budgets').delete().eq('user_id', user.id)
  await client.from('rules').delete().eq('user_id', user.id)
  await client.from('commitments').delete().eq('user_id', user.id)
  await client.from('merchant_aliases').delete().eq('user_id', user.id)
  await client.from('settings').delete().eq('user_id', user.id)
  await client.from('categories').delete().eq('user_id', user.id)
  await client.from('accounts').delete().eq('user_id', user.id)

  const accountIdMap = new Map<number, number>()
  for (const row of backup.accounts) {
    const { data, error } = await client
      .from('accounts')
      .insert({
        user_id: user.id,
        name: row.name,
        institution: row.institution,
        type: row.type,
        is_own: row.is_own,
        is_imported: row.is_imported,
        external_match_patterns: row.external_match_patterns,
        opening_balance: row.opening_balance,
        currency: row.currency,
        color_token: row.color_token,
      })
      .select('id')
      .single()
    if (error) throw error
    accountIdMap.set(row.id, data.id)
  }
  restored.push('accounts')

  const categoryIdMap = new Map<number, number>()
  const parents = backup.categories.filter((c) => c.parent_id == null)
  const children = backup.categories.filter((c) => c.parent_id != null)

  for (const row of parents) {
    const { data, error } = await client
      .from('categories')
      .insert({
        user_id: user.id,
        name: row.name,
        kind: row.kind,
        color_token: row.color_token,
        is_opaque: row.is_opaque,
        is_system: row.is_system,
        parent_id: null,
      })
      .select('id')
      .single()
    if (error) throw error
    categoryIdMap.set(row.id, data.id)
  }
  for (const row of children) {
    const parentId = row.parent_id != null ? categoryIdMap.get(row.parent_id) : null
    if (parentId == null) continue
    const { data, error } = await client
      .from('categories')
      .insert({
        user_id: user.id,
        name: row.name,
        kind: row.kind,
        color_token: row.color_token,
        is_opaque: row.is_opaque,
        is_system: row.is_system,
        parent_id: parentId,
      })
      .select('id')
      .single()
    if (error) throw error
    categoryIdMap.set(row.id, data.id)
  }
  restored.push('categories')

  if (backup.settings) {
    const s = backup.settings
    const { error } = await client.from('settings').insert({
      user_id: user.id,
      period_type: s.period_type,
      payday: s.payday,
      savings_target_cents: s.savings_target_cents,
      savings_target_percent: s.savings_target_percent,
      reminder_cadence_days: s.reminder_cadence_days,
      import_mappings: s.import_mappings as Json,
    })
    if (error) throw error
    restored.push('settings')
  }

  if (backup.rules.length) {
    const rows = backup.rules
      .map((r) => {
        const categoryId = categoryIdMap.get(r.category_id)
        if (categoryId == null) return null
        return {
          user_id: user.id,
          priority: r.priority,
          match_type: r.match_type,
          pattern: r.pattern,
          account_scope:
            r.account_scope != null ? (accountIdMap.get(r.account_scope) ?? null) : null,
          amount_min: r.amount_min,
          amount_max: r.amount_max,
          category_id: categoryId,
          enabled: r.enabled,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r != null)
    if (rows.length) {
      const { error } = await client.from('rules').insert(rows)
      if (error) throw error
      restored.push('rules')
    }
  }

  if (backup.merchant_aliases.length) {
    const { error } = await client.from('merchant_aliases').insert(
      backup.merchant_aliases.map((a) => ({
        user_id: user.id,
        pattern: a.pattern,
        canonical_merchant: a.canonical_merchant,
      })),
    )
    if (error) throw error
    restored.push('merchant_aliases')
  }

  if (backup.commitments.length) {
    const { error } = await client.from('commitments').insert(
      backup.commitments.map((c) => ({
        user_id: user.id,
        merchant: c.merchant,
        amount: c.amount,
        cadence_days: c.cadence_days,
        next_expected_date: c.next_expected_date,
        account_id: c.account_id != null ? (accountIdMap.get(c.account_id) ?? null) : null,
        status: c.status,
        annualised_cents: c.annualised_cents,
      })),
    )
    if (error) throw error
    restored.push('commitments')
  }

  if (backup.budgets.length) {
    const rows = backup.budgets
      .map((b) => {
        const categoryId = categoryIdMap.get(b.category_id)
        if (categoryId == null) return null
        return {
          user_id: user.id,
          category_id: categoryId,
          period_start: b.period_start,
          period_type: b.period_type,
          amount: b.amount,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r != null)
    if (rows.length) {
      const { error } = await client.from('budgets').insert(rows)
      if (error) throw error
      restored.push('budgets')
    }
  }

  return { restored }
}
