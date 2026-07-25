export type TransferTxn = {
  id: number
  accountId: number
  date: string // ISO date
  amount: number
  description: string
  merchant: string
  transferId: number | null
  isOwn: boolean
  accountName: string
  accountNickname?: string | null
  accountLast4?: string | null
}

export type AccountPattern = {
  id: number
  name: string
  isOwn: boolean
  type: string
  externalMatchPatterns: string[]
}

export type ScoredPair = {
  outId: number
  inId: number
  score: number
  amount: number
}

const TRANSFER_KEYWORDS =
  /\b(TRANSFER|TFR|OSKO|PAYID|PAY ANYONE|INTERNAL|BPAY|DIRECT DEBIT)\b/i

const CARD_PAYMENT =
  /\b(CREDIT CARD|CARD PAYMENT|CC PAYMENT|VISA PAYMENT|MASTERCARD PAYMENT)\b/i

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(a) - Date.parse(b))
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

function scorePair(
  out: TransferTxn,
  inn: TransferTxn,
  accounts: Map<number, AccountPattern>,
  candidateCountOut: number,
  candidateCountIn: number,
): number {
  let score = 0
  const gap = daysBetween(out.date, inn.date)
  if (gap === 0) score += 40
  else if (gap === 1) score += 32
  else if (gap <= 3) score += 22
  else if (gap <= 5) score += 10

  const absOut = Math.abs(out.amount)
  if (inn.amount === absOut) score += 30
  else if (Math.abs(inn.amount - absOut) <= 200) score += 12

  const text = `${out.description} ${inn.description}`
  if (TRANSFER_KEYWORDS.test(text)) score += 12

  const other = accounts.get(inn.accountId)
  const self = accounts.get(out.accountId)
  const hay = text.toUpperCase()
  for (const acct of [other, self]) {
    if (!acct) continue
    if (acct.name && hay.includes(acct.name.toUpperCase())) score += 15
  }
  if (inn.accountLast4 && hay.includes(inn.accountLast4)) score += 15
  if (out.accountLast4 && hay.includes(out.accountLast4)) score += 15

  if (candidateCountOut === 1 && candidateCountIn === 1) score += 15

  const dest = accounts.get(inn.accountId)
  if (dest?.type === 'credit_card' && CARD_PAYMENT.test(text)) score += 10

  return Math.min(100, score)
}

/**
 * Spec §5.1 matching — pure function, no Supabase imports.
 * Candidates: exact amount OR within $2 (200 cents).
 */
export function matchTransfers(
  txns: TransferTxn[],
  accounts: AccountPattern[],
): {
  auto: ScoredPair[]
  pending: ScoredPair[]
  patternOneSided: { outId: number; accountInId: number; amount: number }[]
} {
  const accountMap = new Map(accounts.map((a) => [a.id, a]))
  const unmatchedOut = txns.filter(
    (t) => t.amount < 0 && t.transferId == null && t.isOwn,
  )
  // Loan accounts are balance trackers, not transfer partners: a repayment is
  // recognised as an expense on the paying account, never swallowed as a transfer.
  const unmatchedIn = txns.filter(
    (t) =>
      t.amount > 0 &&
      t.transferId == null &&
      t.isOwn &&
      accountMap.get(t.accountId)?.type !== 'loan',
  )

  type Cand = { out: TransferTxn; inn: TransferTxn; score: number }
  const candidates: Cand[] = []

  for (const out of unmatchedOut) {
    const abs = Math.abs(out.amount)
    const pool = unmatchedIn.filter((inn) => {
      if (inn.accountId === out.accountId) return false
      if (!inn.isOwn) return false
      if (daysBetween(out.date, inn.date) > 5) return false
      return inn.amount === abs || Math.abs(inn.amount - abs) <= 200
    })
    for (const inn of pool) {
      const outPoolSize = unmatchedIn.filter((x) => {
        if (x.accountId === out.accountId) return false
        if (daysBetween(out.date, x.date) > 5) return false
        const a = Math.abs(out.amount)
        return x.amount === a || Math.abs(x.amount - a) <= 200
      }).length
      const inPoolSize = unmatchedOut.filter((x) => {
        if (x.accountId === inn.accountId) return false
        if (daysBetween(inn.date, x.date) > 5) return false
        return Math.abs(x.amount) === inn.amount || Math.abs(Math.abs(x.amount) - inn.amount) <= 200
      }).length
      candidates.push({
        out,
        inn,
        score: scorePair(out, inn, accountMap, outPoolSize, inPoolSize),
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const used = new Set<number>()
  const auto: ScoredPair[] = []
  const pending: ScoredPair[] = []

  for (const c of candidates) {
    if (used.has(c.out.id) || used.has(c.inn.id)) continue
    if (c.score < 50) continue
    const pair: ScoredPair = {
      outId: c.out.id,
      inId: c.inn.id,
      score: c.score,
      amount: Math.abs(c.out.amount),
    }
    used.add(c.out.id)
    used.add(c.inn.id)
    if (c.score >= 80) auto.push(pair)
    else pending.push(pair)
  }

  const patternOneSided: { outId: number; accountInId: number; amount: number }[] = []
  for (const out of unmatchedOut) {
    if (used.has(out.id)) continue
    const desc = out.description.toUpperCase()
    for (const acct of accounts) {
      if (acct.id === out.accountId) continue
      if (acct.type === 'loan') continue
      const hit = acct.externalMatchPatterns.some((p) =>
        desc.includes(p.toUpperCase()),
      )
      if (hit) {
        patternOneSided.push({
          outId: out.id,
          accountInId: acct.id,
          amount: Math.abs(out.amount),
        })
        used.add(out.id)
        break
      }
    }
  }

  return { auto, pending, patternOneSided }
}
