import { detectCommitments } from '../src/lib/budget/recurrence.ts'
import { discretionaryPool, median, monthlyNormalise, paceDaysDelta } from '../src/lib/budget/calc.ts'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

// Recurrence: monthly subscription, 4 occurrences, steady amount
{
  const txns = [
    { date: '2026-03-15', amount: -1499, merchant: 'NETFLIX.COM', account_id: 1 },
    { date: '2026-04-15', amount: -1499, merchant: 'NETFLIX.COM', account_id: 1 },
    { date: '2026-05-15', amount: -1499, merchant: 'NETFLIX.COM', account_id: 1 },
    { date: '2026-06-15', amount: -1499, merchant: 'NETFLIX.COM', account_id: 1 },
  ]
  const detected = detectCommitments(txns, '2026-06-20')
  assert(detected.length === 1, 'netflix detected once')
  assert(detected[0]!.cadenceDays === 30, 'netflix cadence is monthly')
  assert(detected[0]!.nextExpectedDate === '2026-07-15', 'netflix next date rolls forward')
  assert(!detected[0]!.possiblyCancelled, 'netflix not flagged cancelled when recent')
  assert(!detected[0]!.priceIncreased, 'netflix not flagged price increase when steady')
}

// Recurrence: fewer than 3 occurrences does not count
{
  const txns = [
    { date: '2026-05-15', amount: -1499, merchant: 'ONE OFF', account_id: 1 },
    { date: '2026-06-15', amount: -1499, merchant: 'ONE OFF', account_id: 1 },
  ]
  assert(detectCommitments(txns, '2026-06-20').length === 0, 'two occurrences is not recurring')
}

// Recurrence: price rose >10% on the latest charge is flagged
{
  const txns = [
    { date: '2026-03-10', amount: -2000, merchant: 'GYM MEMBERSHIP', account_id: 1 },
    { date: '2026-04-10', amount: -2000, merchant: 'GYM MEMBERSHIP', account_id: 1 },
    { date: '2026-05-10', amount: -2000, merchant: 'GYM MEMBERSHIP', account_id: 1 },
    { date: '2026-06-10', amount: -2400, merchant: 'GYM MEMBERSHIP', account_id: 1 },
  ]
  const detected = detectCommitments(txns, '2026-06-15')
  assert(detected.length === 1, 'gym still detected after price rise breaks the ±5% band')
  assert(detected[0]!.priceIncreased, 'gym flagged as price increased')
}

// Recurrence: not seen in 2x its interval is flagged possibly cancelled
{
  const txns = [
    { date: '2026-01-05', amount: -999, merchant: 'OLD SUB', account_id: 1 },
    { date: '2026-02-05', amount: -999, merchant: 'OLD SUB', account_id: 1 },
    { date: '2026-03-05', amount: -999, merchant: 'OLD SUB', account_id: 1 },
  ]
  const detected = detectCommitments(txns, '2026-06-01')
  assert(detected.length === 1, 'old sub still detected')
  assert(detected[0]!.possiblyCancelled, 'old sub flagged possibly cancelled after 2x the interval')
}

// median
{
  assert(median([]) === 0, 'median of empty is 0')
  assert(median([100]) === 100, 'median of one value')
  assert(median([100, 300, 200]) === 200, 'median of odd count')
  assert(median([100, 200, 300, 400]) === 250, 'median of even count')
}

// monthlyNormalise
{
  assert(monthlyNormalise(1400, 14) === 3000, 'fortnightly normalises to ~monthly')
  assert(monthlyNormalise(12000, 365) === Math.round(12000 * (30 / 365)), 'annual normalises to ~monthly')
}

// discretionaryPool
{
  const pool = discretionaryPool({
    verifiedIncomeCents: 500000,
    committedMonthlyCents: 150000,
    debtMinimumsMonthlyCents: 50000,
    savingsTargetCents: 100000,
  })
  assert(pool === 200000, 'discretionary pool subtracts committed, debt, and savings from income')
}

// paceDaysDelta
{
  const ahead = paceDaysDelta({
    allocationCents: 30000,
    spentCents: 5000,
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    today: '2026-06-15',
  })
  assert(ahead !== null && ahead > 0, 'underspending mid-period is ahead of pace')

  const behind = paceDaysDelta({
    allocationCents: 30000,
    spentCents: 25000,
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    today: '2026-06-15',
  })
  assert(behind !== null && behind < 0, 'overspending mid-period is behind pace')

  assert(paceDaysDelta({
    allocationCents: 0,
    spentCents: 100,
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    today: '2026-06-15',
  }) === null, 'zero allocation has no pace')
}

console.log('PASS: budget recurrence detection, median, normalisation, pool, pace')
