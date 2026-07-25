import { addDays, format, parseISO, subDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { buildDedupeKey, selectRowsToInsert, type IncomingTxn } from '@/lib/ledger/dedupe'
import { matchCategory, type CategoriseRule } from '@/lib/ledger/categorise'
import { matchTransfers, type AccountPattern, type TransferTxn } from '@/lib/ledger/transfers'
import { normaliseMerchant } from '@/lib/csv/mapping'

export type CommitRowInput = {
  accountId: number
  date: string
  postedDate?: string | null
  amount: number
  description: string
  merchant?: string
  balance?: number | null
  categoryHint?: string | null
}

export type CommitImportResult = {
  importId: number
  inserted: number
  duplicatesSkipped: number
  dateMin: string | null
  dateMax: string | null
  transfersAuto: number
  transfersPending: number
}

const BATCH = 500

async function loadRules(userId: string): Promise<CategoriseRule[]> {
  const { data, error } = await supabase!
    .from('rules')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true)
  if (error) throw error
  return (data ?? []).map((r) => ({
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

async function uncategorisedId(userId: string): Promise<number | null> {
  const { data } = await supabase!
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'Uncategorised')
    .is('parent_id', null)
    .maybeSingle()
  return data?.id ?? null
}

async function applyTransferMatches(userId: string, dateMin: string, dateMax: string) {
  const from = format(subDays(parseISO(dateMin), 7), 'yyyy-MM-dd')
  const to = format(addDays(parseISO(dateMax), 7), 'yyyy-MM-dd')

  const { data: accounts, error: accErr } = await supabase!
    .from('accounts')
    .select('id, name, type, is_own, external_match_patterns')
    .eq('user_id', userId)
  if (accErr) throw accErr

  const { data: txns, error: txnErr } = await supabase!
    .from('transactions')
    .select('id, account_id, date, amount, description, merchant, transfer_id, status')
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to)
  if (txnErr) throw txnErr

  const accountPatterns: AccountPattern[] = (accounts ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    isOwn: a.is_own,
    type: a.type,
    externalMatchPatterns: a.external_match_patterns ?? [],
  }))
  const accountById = new Map(accountPatterns.map((a) => [a.id, a]))

  const transferTxns: TransferTxn[] = (txns ?? []).map((t) => {
    const acct = accountById.get(t.account_id)
    return {
      id: t.id,
      accountId: t.account_id,
      date: t.date,
      amount: t.amount,
      description: t.description,
      merchant: t.merchant,
      transferId: t.transfer_id,
      isOwn: acct?.isOwn ?? true,
      accountName: acct?.name ?? '',
    }
  })

  const result = matchTransfers(transferTxns, accountPatterns)
  let auto = 0
  let pending = 0

  for (const pair of result.auto) {
    const { data: transfer, error } = await supabase!
      .from('transfers')
      .insert({
        user_id: userId,
        out_txn_id: pair.outId,
        in_txn_id: pair.inId,
        amount: pair.amount,
        confidence: 'high',
        method: 'auto',
        status: 'confirmed',
      })
      .select('id')
      .single()
    if (error) throw error
    await supabase!
      .from('transactions')
      .update({ transfer_id: transfer.id, status: 'active' })
      .in('id', [pair.outId, pair.inId])
    auto += 1
  }

  for (const pair of result.pending) {
    const { data: transfer, error } = await supabase!
      .from('transfers')
      .insert({
        user_id: userId,
        out_txn_id: pair.outId,
        in_txn_id: pair.inId,
        amount: pair.amount,
        confidence: 'medium',
        method: 'auto',
        status: 'pending',
      })
      .select('id')
      .single()
    if (error) throw error
    await supabase!
      .from('transactions')
      .update({ transfer_id: transfer.id, status: 'pending_transfer_review' })
      .in('id', [pair.outId, pair.inId])
    pending += 1
  }

  for (const one of result.patternOneSided) {
    const { data: transfer, error } = await supabase!
      .from('transfers')
      .insert({
        user_id: userId,
        out_txn_id: one.outId,
        in_txn_id: null,
        account_in_id: one.accountInId,
        amount: one.amount,
        confidence: 'high',
        method: 'pattern',
        status: 'confirmed',
      })
      .select('id')
      .single()
    if (error) throw error
    await supabase!
      .from('transactions')
      .update({ transfer_id: transfer.id, status: 'active' })
      .eq('id', one.outId)
    auto += 1
  }

  return { auto, pending }
}

export async function commitImport(args: {
  filename: string
  accountId: number | null
  rows: CommitRowInput[]
  mappingProfileHash?: string | null
}): Promise<CommitImportResult> {
  if (!supabase) throw new Error('Supabase is not configured')
  if (!navigator.onLine) {
    throw new Error('Import requires a connection. Go online and try again.')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to import')

  if (args.rows.length === 0) {
    throw new Error('No rows to import')
  }

  const prepared: IncomingTxn[] = []
  for (const row of args.rows) {
    const merchant = row.merchant?.trim() || normaliseMerchant(row.description)
    const dedupeKey = await buildDedupeKey({
      accountId: row.accountId,
      date: row.date,
      amount: row.amount,
      normalisedDescription: merchant,
    })
    prepared.push({
      accountId: row.accountId,
      date: row.date,
      postedDate: row.postedDate ?? null,
      amount: row.amount,
      description: row.description,
      merchant,
      balance: row.balance ?? null,
      categoryHint: row.categoryHint ?? null,
      dedupeKey,
    })
  }

  const keys = [...new Set(prepared.map((r) => r.dedupeKey))]
  const existingCounts = new Map<string, number>()

  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH)
    const { data, error } = await supabase
      .from('transactions')
      .select('dedupe_key')
      .eq('user_id', user.id)
      .in('dedupe_key', chunk)
    if (error) throw error
    for (const row of data ?? []) {
      existingCounts.set(row.dedupe_key, (existingCounts.get(row.dedupe_key) ?? 0) + 1)
    }
  }

  const { toInsert, duplicatesSkipped } = selectRowsToInsert(prepared, existingCounts)

  const dates = prepared.map((r) => r.date).sort()
  const dateMin = dates[0] ?? null
  const dateMax = dates.at(-1) ?? null

  const { data: importRow, error: importError } = await supabase
    .from('imports')
    .insert({
      user_id: user.id,
      account_id: args.accountId,
      filename: args.filename,
      row_count: toInsert.length,
      date_min: dateMin,
      date_max: dateMax,
      duplicates_skipped: duplicatesSkipped,
      mapping_profile_hash: args.mappingProfileHash ?? null,
    })
    .select('id')
    .single()
  if (importError) throw importError

  const rules = await loadRules(user.id)
  const fallbackCategoryId = await uncategorisedId(user.id)

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH)
    const payload = chunk.map((row) => {
      const matched = matchCategory(
        {
          merchant: row.merchant,
          description: row.description,
          accountId: row.accountId,
          amount: row.amount,
        },
        rules,
      )
      return {
        user_id: user.id,
        account_id: row.accountId,
        date: row.date,
        posted_date: row.postedDate,
        amount: row.amount,
        description: row.description,
        merchant: row.merchant,
        balance: row.balance,
        category_id: matched?.categoryId ?? fallbackCategoryId,
        category_source: matched ? 'rule' : row.categoryHint ? 'import' : null,
        status: 'active',
        dedupe_key: row.dedupeKey,
        import_id: importRow.id,
      }
    })
    const { error } = await supabase.from('transactions').insert(payload)
    if (error) {
      await supabase.from('imports').delete().eq('id', importRow.id)
      throw error
    }
  }

  let transfersAuto = 0
  let transfersPending = 0
  if (dateMin && dateMax && toInsert.length > 0) {
    const matched = await applyTransferMatches(user.id, dateMin, dateMax)
    transfersAuto = matched.auto
    transfersPending = matched.pending
  }

  return {
    importId: importRow.id,
    inserted: toInsert.length,
    duplicatesSkipped,
    dateMin,
    dateMax,
    transfersAuto,
    transfersPending,
  }
}

export async function undoImport(importId: number): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to undo an import')

  const { data: txns } = await supabase
    .from('transactions')
    .select('id, transfer_id')
    .eq('import_id', importId)
    .eq('user_id', user.id)

  const transferIds = [
    ...new Set((txns ?? []).map((t) => t.transfer_id).filter((id): id is number => id != null)),
  ]

  if (transferIds.length) {
    await supabase
      .from('transactions')
      .update({ transfer_id: null, status: 'active' })
      .in('transfer_id', transferIds)
    await supabase.from('transfers').delete().in('id', transferIds).eq('user_id', user.id)
  }

  const { error } = await supabase.from('imports').delete().eq('id', importId).eq('user_id', user.id)
  if (error) throw error
}
