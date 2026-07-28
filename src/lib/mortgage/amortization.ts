import { addMonths, differenceInCalendarMonths, formatISO, parseISO } from 'date-fns'

export type MortgageTerms = {
  originalBalance: number // cents
  interestRate: number // annual percent, e.g. 5.75
  termYears: number
  startDate: string // ISO date
}

export type AmortizationRow = {
  paymentNumber: number
  date: string // ISO
  payment: number // cents
  principal: number // cents
  interest: number // cents
  balance: number // cents (after this payment)
}

/** Standard fixed-payment amortization formula, rounded to whole cents. */
export function monthlyPayment({ originalBalance, interestRate, termYears }: MortgageTerms): number {
  const n = termYears * 12
  const r = interestRate / 100 / 12
  if (r === 0) return Math.round(originalBalance / n)
  const factor = Math.pow(1 + r, n)
  return Math.round((originalBalance * r * factor) / (factor - 1))
}

/** Full month-by-month schedule from start date to payoff. */
export function buildSchedule(terms: MortgageTerms): AmortizationRow[] {
  const n = terms.termYears * 12
  const r = terms.interestRate / 100 / 12
  const payment = monthlyPayment(terms)
  const start = parseISO(terms.startDate)

  const rows: AmortizationRow[] = []
  let balance = terms.originalBalance
  for (let i = 1; i <= n; i++) {
    const interest = Math.round(balance * r)
    let principal = payment - interest
    // Last payment absorbs any rounding drift so the schedule lands on zero.
    if (i === n || principal > balance) principal = balance
    balance = Math.max(0, balance - principal)
    rows.push({
      paymentNumber: i,
      date: formatISO(addMonths(start, i), { representation: 'date' }),
      payment: principal + interest,
      principal,
      interest,
      balance,
    })
    if (balance === 0) break
  }
  return rows
}

export type MortgageProgress = {
  monthlyPayment: number
  currentBalance: number
  principalPaid: number
  interestPaidToDate: number
  paymentsMade: number
  paymentsRemaining: number
  yearsRemaining: number
  payoffDate: string
  percentPaid: number
}

/** Where a mortgage stands today, assuming payments made on schedule with no extras. */
export function currentProgress(terms: MortgageTerms, asOf: Date = new Date()): MortgageProgress {
  const schedule = buildSchedule(terms)
  const start = parseISO(terms.startDate)
  const elapsedMonths = Math.max(0, differenceInCalendarMonths(asOf, start))
  const paymentsMade = Math.min(elapsedMonths, schedule.length)

  const lastPaid = paymentsMade > 0 ? schedule[paymentsMade - 1] : null
  const currentBalance = lastPaid ? lastPaid.balance : terms.originalBalance
  const principalPaid = terms.originalBalance - currentBalance
  const interestPaidToDate = schedule
    .slice(0, paymentsMade)
    .reduce((sum, row) => sum + row.interest, 0)

  const payoffRow = schedule[schedule.length - 1]

  return {
    monthlyPayment: monthlyPayment(terms),
    currentBalance,
    principalPaid,
    interestPaidToDate,
    paymentsMade,
    paymentsRemaining: schedule.length - paymentsMade,
    yearsRemaining: Math.max(0, (schedule.length - paymentsMade) / 12),
    payoffDate: payoffRow ? payoffRow.date : terms.startDate,
    percentPaid: terms.originalBalance > 0 ? principalPaid / terms.originalBalance : 0,
  }
}

const FORWARD_PROJECTION_CAP_MONTHS = 600 // 50 years — safety cap, not expected to bind

/**
 * Simulates forward from a real bank balance at the loan's contracted payment,
 * so extra payments (or falling behind) shift the payoff date correctly instead
 * of assuming the original schedule was followed exactly.
 */
function projectPayoff(
  terms: MortgageTerms,
  fromBalanceCents: number,
  asOf: Date,
): { paymentsRemaining: number; yearsRemaining: number; payoffDate: string } {
  const payment = monthlyPayment(terms)
  const r = terms.interestRate / 100 / 12
  let balance = fromBalanceCents
  let months = 0
  while (balance > 0 && months < FORWARD_PROJECTION_CAP_MONTHS) {
    const interest = Math.round(balance * r)
    const principal = payment - interest
    if (principal <= 0) {
      months = FORWARD_PROJECTION_CAP_MONTHS
      break
    }
    balance = Math.max(0, balance - principal)
    months += 1
  }
  return {
    paymentsRemaining: months,
    yearsRemaining: months / 12,
    payoffDate: formatISO(addMonths(asOf, months), { representation: 'date' }),
  }
}

/**
 * Progress using the real balance from a linked account's imported transactions,
 * rather than assuming every payment landed exactly on the textbook schedule.
 */
export function progressFromActualBalance(
  terms: MortgageTerms,
  actualBalanceCents: number,
  asOf: Date = new Date(),
): MortgageProgress {
  const principalPaid = Math.max(0, terms.originalBalance - actualBalanceCents)
  const payment = monthlyPayment(terms)
  const elapsedMonths = Math.max(0, differenceInCalendarMonths(asOf, parseISO(terms.startDate)))
  // Best-effort split: total paid at the contracted amount, minus real principal paid.
  const interestPaidToDate = Math.max(0, payment * elapsedMonths - principalPaid)
  const projection = projectPayoff(terms, actualBalanceCents, asOf)

  return {
    monthlyPayment: payment,
    currentBalance: actualBalanceCents,
    principalPaid,
    interestPaidToDate,
    paymentsMade: elapsedMonths,
    paymentsRemaining: projection.paymentsRemaining,
    yearsRemaining: projection.yearsRemaining,
    payoffDate: projection.payoffDate,
    percentPaid: terms.originalBalance > 0 ? principalPaid / terms.originalBalance : 0,
  }
}
