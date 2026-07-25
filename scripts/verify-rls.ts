/**
 * RLS isolation check for Phase 0.5.
 *
 * Creates two users, inserts an account as user A, then confirms user B
 * cannot read it. Run against a running local Supabase:
 *
 *   npx tsx scripts/verify-rls.ts
 *
 * Or after linking a remote project with test users.
 */
import { createClient } from '@supabase/supabase-js'

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

async function main() {
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: signUpA, error: errA } = await anon.auth.signUp(userA)
  if (errA || !signUpA.user) throw new Error(`User A signup failed: ${errA?.message}`)

  const { data: signUpB, error: errB } = await anon.auth.signUp(userB)
  if (errB || !signUpB.user) throw new Error(`User B signup failed: ${errB?.message}`)

  const clientA = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInA } = await clientA.auth.signInWithPassword(userA)
  if (signInA) throw new Error(`User A sign-in failed: ${signInA.message}`)

  const { data: account, error: insertErr } = await clientA
    .from('accounts')
    .insert({
      name: 'RLS Test Everyday',
      institution: 'Test Bank',
      type: 'transaction',
      color_token: 'cat-1',
    })
    .select('id, user_id, name')
    .single()

  if (insertErr || !account) {
    throw new Error(`Insert as A failed: ${insertErr?.message}`)
  }

  if (account.user_id !== signUpA.user.id) {
    throw new Error(`Expected account.user_id=${signUpA.user.id}, got ${account.user_id}`)
  }

  const clientB = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInB } = await clientB.auth.signInWithPassword(userB)
  if (signInB) throw new Error(`User B sign-in failed: ${signInB.message}`)

  const { data: leaked, error: selectErr } = await clientB
    .from('accounts')
    .select('id, name')
    .eq('id', account.id)

  if (selectErr) {
    throw new Error(`Select as B failed unexpectedly: ${selectErr.message}`)
  }

  if (leaked && leaked.length > 0) {
    console.error('FAIL: User B can read User A account rows.', leaked)
    process.exit(1)
  }

  console.log('PASS: User B cannot see User A account (id=%s).', account.id)
  console.log('User A id: %s', signUpA.user.id)
  console.log('User B id: %s', signUpB.user.id)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
