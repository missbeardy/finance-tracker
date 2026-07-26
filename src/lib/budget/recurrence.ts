import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'

/** Spec §7.1 — standard cadences with a tolerance window in days. */
const CADENCES = [
  { days: 7, tolerance: 2 },
  { days: 14, tolerance: 3 },
  { days: 30, tolerance: 5 }, // 28–31
  { days: 90, tolerance: 10 },
  { days: 365, tolerance: 20 },
] as const

export type RecurrenceTxn = {
  date: string
  amount: number
  merchant: string
  account_id: number
}

export type DetectedCommitment = {
  merchant: string
  amount: number
  cadenceDays: number
  nextExpectedDate: string
  accountId: number
  occurrences: number
  lastDate: string
  annualisedCents: number
  priceIncreased: boolean
  possiblyCancelled: boolean
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Scan the ledger for repeating merchant/amount patterns.
 * Spec §7.1: same normalised merchant, amount within ±5%, interval clustering
 * around 7 / 14 / 28–31 / 90 / 365 days, at least 3 occurrences.
 */
export function detectCommitments(
  txns: RecurrenceTxn[],
  referenceDate: string,
): DetectedCommitment[] {
  const byMerchant = new Map<string, RecurrenceTxn[]>()
  for (const t of txns) {
    if (t.amount >= 0) continue
    const key = t.merchant.trim().toUpperCase()
    if (!key) continue
    const list = byMerchant.get(key) ?? []
    list.push(t)
    byMerchant.set(key, list)
  }

  const results: DetectedCommitment[] = []

  for (const group of byMerchant.values()) {
    if (group.length < 3) continue
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date))
    const last = sorted[sorted.length - 1]!
    const baseline = sorted.slice(0, -1)

    // Establish the pattern from history, then check the latest charge against it —
    // a one-off price rise must not knock the most recent charge out of its own pattern.
    const baseAmounts = baseline.map((t) => Math.abs(t.amount))
    const baseMedian = median(baseAmounts)
    if (baseMedian <= 0) continue
    const consistentBaseline = baseline.filter(
      (t) => Math.abs(Math.abs(t.amount) - baseMedian) / baseMedian <= 0.05,
    )
    if (consistentBaseline.length < 2) continue

    const sequence = [...consistentBaseline, last].sort((a, b) => a.date.localeCompare(b.date))
    const gaps: number[] = []
    for (let i = 1; i < sequence.length; i++) {
      gaps.push(differenceInCalendarDays(parseISO(sequence[i]!.date), parseISO(sequence[i - 1]!.date)))
    }
    const medGap = median(gaps)

    const cadence = CADENCES.find((c) => Math.abs(medGap - c.days) <= c.tolerance)
    if (!cadence) continue
    const maxDeviation = Math.max(...gaps.map((g) => Math.abs(g - medGap)))
    if (maxDeviation > cadence.tolerance * 2) continue

    const priceIncreased = Math.abs(last.amount) > baseMedian * 1.1

    const daysSinceLast = differenceInCalendarDays(parseISO(referenceDate), parseISO(last.date))
    const possiblyCancelled = daysSinceLast > cadence.days * 2

    results.push({
      merchant: last.merchant.trim(),
      amount: Math.abs(last.amount),
      cadenceDays: cadence.days,
      nextExpectedDate: format(addDays(parseISO(last.date), cadence.days), 'yyyy-MM-dd'),
      accountId: last.account_id,
      occurrences: sequence.length,
      lastDate: last.date,
      annualisedCents: Math.round(Math.abs(last.amount) * (365 / cadence.days)),
      priceIncreased,
      possiblyCancelled,
    })
  }

  return results.sort((a, b) => b.annualisedCents - a.annualisedCents)
}
