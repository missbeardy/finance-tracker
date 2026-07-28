import { monthlyPayment, buildSchedule, currentProgress } from '../src/lib/mortgage/amortization.ts'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

// Known-answer check: $500,000 @ 6% p.a., 30yr term -> $2997.75/mo (standard formula)
{
  const terms = {
    originalBalance: 50_000_000,
    interestRate: 6,
    termYears: 30,
    startDate: '2020-01-01',
  }
  const payment = monthlyPayment(terms)
  assert(payment === 299775, `expected $2997.75 payment, got ${payment / 100}`)
}

// Schedule fully amortizes to exactly zero and has termYears*12 rows
{
  const terms = {
    originalBalance: 75_000_000,
    interestRate: 5.75,
    termYears: 30,
    startDate: '2022-06-01',
  }
  const schedule = buildSchedule(terms)
  assert(schedule.length === 360, `expected 360 rows, got ${schedule.length}`)
  const last = schedule[schedule.length - 1]!
  assert(last.balance === 0, `schedule should reach exactly 0, got ${last.balance}`)
  const totalPrincipal = schedule.reduce((s, r) => s + r.principal, 0)
  assert(
    totalPrincipal === terms.originalBalance,
    `principal payments should sum to original balance, got ${totalPrincipal} vs ${terms.originalBalance}`,
  )
}

// Progress at exactly the start date: no payments made yet
{
  const terms = {
    originalBalance: 60_000_000,
    interestRate: 5,
    termYears: 25,
    startDate: '2026-07-28',
  }
  const progress = currentProgress(terms, new Date('2026-07-28'))
  assert(progress.paymentsMade === 0, `expected 0 payments made, got ${progress.paymentsMade}`)
  assert(
    progress.currentBalance === terms.originalBalance,
    `expected full balance remaining, got ${progress.currentBalance}`,
  )
}

// Progress after 12 months: balance has decreased, interest accrued
{
  const terms = {
    originalBalance: 60_000_000,
    interestRate: 5,
    termYears: 25,
    startDate: '2025-01-01',
  }
  const progress = currentProgress(terms, new Date('2026-01-01'))
  assert(progress.paymentsMade === 12, `expected 12 payments made, got ${progress.paymentsMade}`)
  assert(progress.currentBalance < terms.originalBalance, 'balance should have decreased')
  assert(progress.principalPaid > 0, 'some principal should be paid')
  assert(progress.interestPaidToDate > 0, 'some interest should be paid')
  assert(progress.percentPaid > 0 && progress.percentPaid < 1, 'percent paid should be between 0 and 1')
}

// Zero-rate loan splits evenly and lands on exactly zero
{
  const terms = {
    originalBalance: 12_00,
    interestRate: 0,
    termYears: 1,
    startDate: '2026-01-01',
  }
  const schedule = buildSchedule(terms)
  assert(schedule.length === 12, `expected 12 rows, got ${schedule.length}`)
  assert(schedule[schedule.length - 1]!.balance === 0, 'zero-rate loan should reach exactly 0')
  assert(schedule.every((r) => r.interest === 0), 'zero-rate loan should have no interest')
}

console.log('mortgage amortization tests passed')
