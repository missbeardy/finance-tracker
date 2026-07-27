/**
 * RLS isolation check for Phase 0.
 *
 * Creates two users, inserts finance rows as user A, then confirms user B
 * cannot read them. Run against a reachable Supabase project:
 *
 *   npm run verify:rls
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_* equivalents).')
  process.exit(1)
}

const stamp = Date.now()
const userA = {
  email: `randall-a-${stamp}@example.com`,
  password: 'test-password-a-123456',
}
const userB = {
  email: `randall-b-${stamp}@example.com`,
  password: 'test-password-b-123456',
}

type CaseResult = { table: string; ok: boolean; detail?: string }

async function assertBCannotSee(
  clientB: SupabaseClient,
  table: string,
  column: string,
  id: string | number,
): Promise<CaseResult> {
  const { data, error } = await clientB.from(table).select(column).eq(column, id)
  if (error) {
    return { table, ok: false, detail: `select failed: ${error.message}` }
  }
  if (data && data.length > 0) {
    return { table, ok: false, detail: `User B can read User A row (${column}=${id})` }
  }
  return { table, ok: true }
}

async function main() {
  const anon = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: signUpA, error: errA } = await anon.auth.signUp(userA)
  if (errA || !signUpA.user) throw new Error(`User A signup failed: ${errA?.message}`)

  const { data: signUpB, error: errB } = await anon.auth.signUp(userB)
  if (errB || !signUpB.user) throw new Error(`User B signup failed: ${errB?.message}`)

  const clientA = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInA } = await clientA.auth.signInWithPassword(userA)
  if (signInA) throw new Error(`User A sign-in failed: ${signInA.message}`)

  const clientB = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInB } = await clientB.auth.signInWithPassword(userB)
  if (signInB) throw new Error(`User B sign-in failed: ${signInB.message}`)

  const results: CaseResult[] = []

  // --- accounts ---
  const { data: account, error: accountErr } = await clientA
    .from('accounts')
    .insert({
      name: 'RLS Test Everyday',
      institution: 'Test Bank',
      type: 'transaction',
      color_token: 'cat-1',
    })
    .select('id, user_id')
    .single()
  if (accountErr || !account) throw new Error(`Insert accounts failed: ${accountErr?.message}`)
  if (account.user_id !== signUpA.user.id) {
    throw new Error(`Expected account.user_id=${signUpA.user.id}, got ${account.user_id}`)
  }
  results.push(await assertBCannotSee(clientB, 'accounts', 'id', account.id))

  // --- categories ---
  const { data: category, error: categoryErr } = await clientA
    .from('categories')
    .insert({
      name: `RLS Test Cat ${stamp}`,
      kind: 'expense',
      color_token: 'cat-1',
      is_system: false,
      is_opaque: false,
    })
    .select('id')
    .single()
  if (categoryErr || !category) throw new Error(`Insert categories failed: ${categoryErr?.message}`)
  results.push(await assertBCannotSee(clientB, 'categories', 'id', category.id))

  // --- settings ---
  const { data: settings, error: settingsErr } = await clientA
    .from('settings')
    .insert({
      period_type: 'calendar_month',
      reminder_cadence_days: 14,
      import_mappings: {},
    })
    .select('id')
    .single()
  if (settingsErr || !settings) throw new Error(`Insert settings failed: ${settingsErr?.message}`)
  results.push(await assertBCannotSee(clientB, 'settings', 'id', settings.id))

  // --- rules ---
  const { data: rule, error: ruleErr } = await clientA
    .from('rules')
    .insert({
      priority: 100,
      match_type: 'contains',
      pattern: `RLS-TEST-${stamp}`,
      category_id: category.id,
      enabled: true,
    })
    .select('id')
    .single()
  if (ruleErr || !rule) throw new Error(`Insert rules failed: ${ruleErr?.message}`)
  results.push(await assertBCannotSee(clientB, 'rules', 'id', rule.id))

  // --- budgets ---
  const { data: budget, error: budgetErr } = await clientA
    .from('budgets')
    .insert({
      category_id: category.id,
      period_start: '2026-07-01',
      period_type: 'calendar_month',
      amount: 1000,
    })
    .select('id')
    .single()
  if (budgetErr || !budget) throw new Error(`Insert budgets failed: ${budgetErr?.message}`)
  results.push(await assertBCannotSee(clientB, 'budgets', 'id', budget.id))

  // --- merchant_aliases ---
  const { data: alias, error: aliasErr } = await clientA
    .from('merchant_aliases')
    .insert({
      pattern: `rls-alias-${stamp}`,
      canonical_merchant: 'RLS Alias',
    })
    .select('id')
    .single()
  if (aliasErr || !alias) throw new Error(`Insert merchant_aliases failed: ${aliasErr?.message}`)
  results.push(await assertBCannotSee(clientB, 'merchant_aliases', 'id', alias.id))

  // --- commitments ---
  const { data: commitment, error: commitmentErr } = await clientA
    .from('commitments')
    .insert({
      merchant: `RLS Commitment ${stamp}`,
      amount: 2500,
      cadence_days: 30,
      status: 'detected',
    })
    .select('id')
    .single()
  if (commitmentErr || !commitment) {
    throw new Error(`Insert commitments failed: ${commitmentErr?.message}`)
  }
  results.push(await assertBCannotSee(clientB, 'commitments', 'id', commitment.id))

  // --- imports + transactions (linked) ---
  const { data: importRow, error: importErr } = await clientA
    .from('imports')
    .insert({
      account_id: account.id,
      filename: `rls-test-${stamp}.csv`,
      row_count: 1,
      date_min: '2026-07-01',
      date_max: '2026-07-01',
      duplicates_skipped: 0,
    })
    .select('id')
    .single()
  if (importErr || !importRow) throw new Error(`Insert imports failed: ${importErr?.message}`)
  results.push(await assertBCannotSee(clientB, 'imports', 'id', importRow.id))

  const { data: txn, error: txnErr } = await clientA
    .from('transactions')
    .insert({
      account_id: account.id,
      date: '2026-07-01',
      amount: -1234,
      description: 'RLS test txn',
      merchant: 'RLS Merchant',
      category_id: category.id,
      status: 'active',
      dedupe_key: `rls-dedupe-${stamp}`,
      import_id: importRow.id,
    })
    .select('id')
    .single()
  if (txnErr || !txn) throw new Error(`Insert transactions failed: ${txnErr?.message}`)
  results.push(await assertBCannotSee(clientB, 'transactions', 'id', txn.id))

  // --- transfers ---
  const { data: transfer, error: transferErr } = await clientA
    .from('transfers')
    .insert({
      out_txn_id: txn.id,
      in_txn_id: null,
      amount: 1234,
      confidence: 'high',
      method: 'manual',
      status: 'confirmed',
    })
    .select('id')
    .single()
  if (transferErr || !transfer) throw new Error(`Insert transfers failed: ${transferErr?.message}`)
  results.push(await assertBCannotSee(clientB, 'transfers', 'id', transfer.id))

  // --- push_subscriptions ---
  const { data: push, error: pushErr } = await clientA
    .from('push_subscriptions')
    .insert({
      endpoint: `https://example.com/rls-push-${stamp}`,
      p256dh: 'test-p256dh',
      auth: 'test-auth',
    })
    .select('id')
    .single()
  if (pushErr || !push) throw new Error(`Insert push_subscriptions failed: ${pushErr?.message}`)
  results.push(await assertBCannotSee(clientB, 'push_subscriptions', 'id', push.id))

  const failed = results.filter((r) => !r.ok)
  for (const r of results) {
    console.log('%s %s%s', r.ok ? 'PASS' : 'FAIL', r.table, r.detail ? ` — ${r.detail}` : '')
  }

  if (failed.length) {
    console.error('\n%d table(s) failed RLS isolation.', failed.length)
    process.exit(1)
  }

  console.log('\nPASS: User B cannot see User A rows across %d tables.', results.length)
  console.log('User A id: %s', signUpA.user.id)
  console.log('User B id: %s', signUpB.user.id)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
