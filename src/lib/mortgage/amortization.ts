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
