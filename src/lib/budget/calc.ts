import { differenceInCalendarDays, parseISO } from 'date-fns'

export function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
}

/** Monthly-normalise a recurring amount from its cadence. */
export function monthlyNormalise(amountCents: number, cadenceDays: number): number {
  if (cadenceDays <= 0) return 0
  return Math.round(amountCents * (30 / cadenceDays))
}

export type SustainableBudgetInput = {
  verifiedIncomeCents: number
  committedMonthlyCents: number
  debtMinimumsMonthlyCents: number
  savingsTargetCents: number
}

/** Spec §7.2 — Discretionary pool = income − committed − debt − savings. */
export function discretionaryPool(input: SustainableBudgetInput): number {
  return (
    input.verifiedIncomeCents -
    input.committedMonthlyCents -
    input.debtMinimumsMonthlyCents -
    input.savingsTargetCents
  )
}

/**
 * Days ahead of (positive) or behind (negative) an even burn rate through the period.
 * Returns null when there's no allocation to pace against.
 */
export function paceDaysDelta(args: {
  allocationCents: number
  spentCents: number
  periodStart: string
  periodEnd: string
  today: string
}): number | null {
  if (args.allocationCents <= 0) return null
  const totalDays = differenceInCalendarDays(parseISO(args.periodEnd), parseISO(args.periodStart)) + 1
  if (totalDays <= 0) return null
  const rawElapsed = differenceInCalendarDays(parseISO(args.today), parseISO(args.periodStart)) + 1
  const elapsedDays = Math.min(Math.max(rawElapsed, 0), totalDays)
  const dailyRate = args.allocationCents / totalDays
  if (dailyRate <= 0) return null
  const daysWorthSpent = args.spentCents / dailyRate
  return Math.round(elapsedDays - daysWorthSpent)
}
