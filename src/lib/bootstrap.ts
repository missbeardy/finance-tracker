import { supabase } from '@/lib/supabase'
import { CATEGORY_SEED, OPAQUE_CATEGORY_NAMES } from '@/lib/categories/seed'
import { AU_MERCHANT_SEED_RULES } from '@/lib/categories/auRules'
import { formatSupabaseError, isUniqueViolation } from '@/lib/errors'

/** Critical path only (categories + settings). Rules seed in the background. */
const BOOTSTRAP_TIMEOUT_MS = 20_000

/**
 * Shares one in-flight attempt per user so Strict Mode double-mounts and
 * "Try again" clicks don't stack concurrent bootstrap runs on top of each other
 * (each stacked run made the next timeout less likely to be hit in time).
 */
const inFlightBootstraps = new Map<string, Promise<void>>()

/** Users whose critical bootstrap already succeeded this JS session. */
const completedBootstraps = new Set<string>()

export function isBootstrapComplete(userId: string): boolean {
  return completedBootstraps.has(userId)
}

export function clearBootstrapSession(userId?: string) {
  if (userId) {
    completedBootstraps.delete(userId)
    inFlightBootstraps.delete(userId)
    return
  }
  completedBootstraps.clear()
  inFlightBootstraps.clear()
}

/**
 * First-login bootstrap: seed categories and settings (required to enter the app).
 * Merchant rules are best-effort and do not block the gate.
 * Idempotent. Rejects if critical Supabase calls hang past the timeout.
 */
export async function ensureUserBootstrap(userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')

  if (completedBootstraps.has(userId)) return

  const existing = inFlightBootstraps.get(userId)
  if (existing) return existing

  const attempt = withTimeout(runCriticalBootstrap(userId), BOOTSTRAP_TIMEOUT_MS, () => {
    throw new Error(
      'Preparing your ledger timed out. Check your connection and that the Supabase schema is applied (see HANDOFF.md).',
    )
  })
    .then(() => {
      completedBootstraps.add(userId)
    })
    .finally(() => {
      inFlightBootstraps.delete(userId)
    })

  inFlightBootstraps.set(userId, attempt)
  await attempt

  // Do not block dashboard entry on rule seeding.
  void seedRulesIfEmpty(userId).catch((err) => {
    console.warn('[bootstrap] merchant rules seed skipped:', err)
  })
}

async function runCriticalBootstrap(userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')

  const { count, error: countError } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (countError) {
    throw new Error(formatSupabaseError('Could not read categories', countError))
  }

  if ((count ?? 0) === 0) {
    await seedCategories(userId)
  }

  const { data: existingSettings, error: settingsLookupError } = await supabase
    .from('settings')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (settingsLookupError) {
    throw new Error(formatSupabaseError('Could not read settings', settingsLookupError))
  }

  if (!existingSettings) {
    const { error: settingsInsertError } = await supabase.from('settings').insert({
      user_id: userId,
      period_type: 'calendar_month',
      reminder_cadence_days: 14,
      import_mappings: {},
    })
    if (settingsInsertError && !isUniqueViolation(settingsInsertError)) {
      throw new Error(formatSupabaseError('Could not create settings', settingsInsertError))
    }
  }
}

/**
 * Seeds all parent + child categories in two bulk inserts instead of one
 * round trip per row (13 parents × up to 5 children was ~26 sequential
 * awaits, which routinely blew past BOOTSTRAP_TIMEOUT_MS on real connections).
 * Falls back to a slower per-row reconciliation only if a previous run left
 * partial state behind (rare: interrupted mid-seed, or a race on retry).
 */
async function seedCategories(userId: string): Promise<void> {
  if (!supabase) return

  const parentIdByName = await seedParentCategories(userId)

  const childRows = CATEGORY_SEED.flatMap((parent) => {
    const parentId = parentIdByName.get(parent.name)
    if (!parent.children?.length || parentId == null) return []
    return parent.children.map((child) => ({
      user_id: userId,
      name: child.name,
      kind: child.kind,
      parent_id: parentId,
      color_token: parent.colorToken,
      is_system: child.isSystem ?? false,
      is_opaque: child.isOpaque ?? OPAQUE_CATEGORY_NAMES.has(child.name),
    }))
  })
  if (!childRows.length || !supabase) return

  const { error: childError } = await supabase.from('categories').insert(childRows)
  if (!childError) return
  if (!isUniqueViolation(childError)) {
    throw new Error(formatSupabaseError('Could not seed categories', childError))
  }

  // Partial state from an earlier interrupted run: insert only what's missing.
  const parentIds = [...parentIdByName.values()]
  const { data: existingChildren, error: existingError } = await supabase
    .from('categories')
    .select('name, parent_id')
    .eq('user_id', userId)
    .in('parent_id', parentIds)
  if (existingError) {
    throw new Error(formatSupabaseError('Could not verify existing categories', existingError))
  }
  const existingKeys = new Set((existingChildren ?? []).map((row) => `${row.parent_id}:${row.name}`))
  const missing = childRows.filter((row) => !existingKeys.has(`${row.parent_id}:${row.name}`))
  if (missing.length) {
    const { error: retryError } = await supabase.from('categories').insert(missing)
    if (retryError && !isUniqueViolation(retryError)) {
      throw new Error(formatSupabaseError('Could not seed categories', retryError))
    }
  }
}

async function seedParentCategories(userId: string): Promise<Map<string, number>> {
  if (!supabase) return new Map()

  const parentRows = CATEGORY_SEED.map((parent) => ({
    user_id: userId,
    name: parent.name,
    kind: parent.kind,
    color_token: parent.colorToken,
    is_system: parent.isSystem ?? false,
    is_opaque: OPAQUE_CATEGORY_NAMES.has(parent.name),
    parent_id: null,
  }))

  const { data: inserted, error: insertError } = await supabase
    .from('categories')
    .insert(parentRows)
    .select('id, name')

  if (!insertError) {
    return new Map((inserted ?? []).map((row) => [row.name, row.id]))
  }
  if (!isUniqueViolation(insertError)) {
    throw new Error(formatSupabaseError('Could not seed categories', insertError))
  }

  // Partial state from an earlier interrupted run: reuse what exists, insert what's missing.
  const { data: existing, error: lookupError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('user_id', userId)
    .is('parent_id', null)
  if (lookupError) {
    throw new Error(formatSupabaseError('Could not look up existing categories', lookupError))
  }
  const byName = new Map((existing ?? []).map((row) => [row.name, row.id]))
  const missing = parentRows.filter((row) => !byName.has(row.name))
  if (missing.length) {
    const { data: filled, error: fillError } = await supabase
      .from('categories')
      .insert(missing)
      .select('id, name')
    if (fillError && !isUniqueViolation(fillError)) {
      throw new Error(formatSupabaseError('Could not seed categories', fillError))
    }
    for (const row of filled ?? []) byName.set(row.name, row.id)
  }
  return byName
}

/**
 * Tops up any AU_MERCHANT_SEED_RULES not yet present for this user, keyed by
 * match type + pattern. Runs on every login (not just first) so rules added
 * to the seed set later (e.g. mortgage repayments) reach existing users
 * without a manual DB fix. Never touches rules a user has edited or disabled.
 */
async function seedRulesIfEmpty(userId: string) {
  if (!supabase) return

  const { data: existingRules, error } = await supabase
    .from('rules')
    .select('match_type, pattern')
    .eq('user_id', userId)
  if (error) throw new Error(formatSupabaseError('Could not read rules', error))

  const existingKeys = new Set(
    (existingRules ?? []).map((r) => `${r.match_type}:${r.pattern.toUpperCase()}`),
  )
  const missingSeedRules = AU_MERCHANT_SEED_RULES.filter(
    (rule) => !existingKeys.has(`${rule.matchType}:${rule.pattern.toUpperCase()}`),
  )
  if (!missingSeedRules.length) return

  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, name, parent_id')
    .eq('user_id', userId)
  if (catError) throw new Error(formatSupabaseError('Could not load categories for rules', catError))

  function resolvePath(path: [string, string?]): number | null {
    const [parentName, childName] = path
    const parent = (categories ?? []).find(
      (c) => c.name === parentName && c.parent_id == null,
    )
    if (!parent) return null
    if (!childName) return parent.id
    const child = (categories ?? []).find(
      (c) => c.name === childName && c.parent_id === parent.id,
    )
    return child?.id ?? parent.id
  }

  const rows = missingSeedRules.map((rule) => {
    const categoryId = resolvePath(rule.categoryPath)
    if (categoryId == null) return null
    return {
      user_id: userId,
      priority: rule.priority,
      match_type: rule.matchType,
      pattern: rule.pattern,
      category_id: categoryId,
      enabled: true,
    }
  }).filter((r): r is NonNullable<typeof r> => r != null)

  if (rows.length) {
    const chunkSize = 40
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize)
      const { error: insertError } = await supabase.from('rules').insert(chunk)
      if (insertError && !isUniqueViolation(insertError)) {
        throw new Error(formatSupabaseError('Could not seed merchant rules', insertError))
      }
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => never): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout()
      } catch (err) {
        reject(err)
      }
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer != null) clearTimeout(timer)
  })
}

