/** Spec §4.2 — sha1(accountId | date | amount | normalisedDescription) */

export async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-1', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function buildDedupeKey(args: {
  accountId: number
  date: string
  amount: number
  normalisedDescription: string
}): Promise<string> {
  const payload = `${args.accountId}|${args.date}|${args.amount}|${args.normalisedDescription}`
  return sha1Hex(payload)
}

export type IncomingTxn = {
  accountId: number
  date: string
  postedDate?: string | null
  amount: number
  description: string
  merchant: string
  balance?: number | null
  categoryHint?: string | null
  dedupeKey: string
}

/**
 * Count-delta dedupe: for each key, insert max(0, n_new - n_existing).
 * Preserves legitimate same-day duplicate purchases.
 */
export function selectRowsToInsert(
  incoming: IncomingTxn[],
  existingCounts: Map<string, number>,
): { toInsert: IncomingTxn[]; duplicatesSkipped: number } {
  const newCounts = new Map<string, number>()
  for (const row of incoming) {
    newCounts.set(row.dedupeKey, (newCounts.get(row.dedupeKey) ?? 0) + 1)
  }

  const remaining = new Map<string, number>()
  for (const [key, nNew] of newCounts) {
    const nExisting = existingCounts.get(key) ?? 0
    remaining.set(key, Math.max(0, nNew - nExisting))
  }

  const toInsert: IncomingTxn[] = []
  let duplicatesSkipped = 0

  for (const row of incoming) {
    const left = remaining.get(row.dedupeKey) ?? 0
    if (left > 0) {
      toInsert.push(row)
      remaining.set(row.dedupeKey, left - 1)
    } else {
      duplicatesSkipped += 1
    }
  }

  return { toInsert, duplicatesSkipped }
}
