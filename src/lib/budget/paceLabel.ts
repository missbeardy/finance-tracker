/** Human pacing label from days-ahead (positive) / behind (negative). */
export function paceLabel(pace: number | null): string | null {
  if (pace == null) return null
  if (pace === 0) return 'On pace'
  if (pace >= 14) return `Well ahead (${pace}d)`
  if (pace > 0) return `Slightly ahead (${pace}d)`
  if (pace <= -14) return `Spending fast (${Math.abs(pace)}d behind)`
  return `A little behind (${Math.abs(pace)}d)`
}
