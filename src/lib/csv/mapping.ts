export type CsvField =
  | 'date'
  | 'posted_date'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'direction'
  | 'description'
  | 'balance'
  | 'account'
  | 'category'
  | 'skip'

export type ColumnMapping = Record<string, CsvField>

const ALIASES: Record<Exclude<CsvField, 'skip'>, string[]> = {
  date: ['date', 'transaction date', 'value date', 'trans date'],
  posted_date: ['posted date', 'posting date'],
  amount: ['amount', 'value', 'transaction amount'],
  debit: ['debit', 'withdrawal', 'money out', 'withdrawals'],
  credit: ['credit', 'deposit', 'money in', 'deposits'],
  direction: ['type', 'dr/cr', 'credit/debit', 'transaction type', 'direction'],
  description: [
    'description',
    'narrative',
    'details',
    'transaction details',
    'merchant',
    'particulars',
    'memo',
  ],
  balance: ['balance', 'running balance', 'account balance'],
  account: ['account', 'account name', 'account nickname'],
  category: ['category', 'categories'],
}

function norm(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Auto-match CSV headers to ledger fields using known aliases. */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const used = new Set<CsvField>()

  for (const header of headers) {
    const n = norm(header)
    let matched: CsvField = 'skip'
    for (const [field, aliases] of Object.entries(ALIASES) as [
      Exclude<CsvField, 'skip'>,
      string[],
    ][]) {
      if (used.has(field)) continue
      if (aliases.includes(n)) {
        matched = field
        used.add(field)
        break
      }
    }
    mapping[header] = matched
  }
  return mapping
}

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'

/**
 * Prefer Australian DD/MM/YYYY. If any day token > 12 appears in first position,
 * treat as DD/MM; if only in second, MM/DD. Ambiguous → DD/MM/YYYY.
 */
export function detectDateFormat(samples: string[]): DateFormat | 'ambiguous' {
  let sawIso = false
  let dayFirstEvidence = false
  let monthFirstEvidence = false

  for (const raw of samples) {
    const value = raw.trim()
    if (!value) continue
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      sawIso = true
      continue
    }
    const m = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
    if (!m) continue
    const a = Number(m[1])
    const b = Number(m[2])
    if (a > 12 && b <= 12) dayFirstEvidence = true
    if (b > 12 && a <= 12) monthFirstEvidence = true
  }

  if (sawIso && !dayFirstEvidence && !monthFirstEvidence) return 'YYYY-MM-DD'
  if (dayFirstEvidence && !monthFirstEvidence) return 'DD/MM/YYYY'
  if (monthFirstEvidence && !dayFirstEvidence) return 'MM/DD/YYYY'
  if (dayFirstEvidence && monthFirstEvidence) return 'ambiguous'
  return 'DD/MM/YYYY'
}

export function parseDateToIso(value: string, format: DateFormat): string | null {
  const v = value.trim()
  if (!v) return null

  if (format === 'YYYY-MM-DD') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return null
    return `${m[1]}-${m[2]}-${m[3]}`
  }

  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (!m) return null
  let day = Number(m[1])
  let month = Number(m[2])
  if (format === 'MM/DD/YYYY') {
    month = Number(m[1])
    day = Number(m[2])
  }
  let year = Number(m[3])
  if (year < 100) year += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`
}

/** Normalise amount cell to signed cents. Money out is negative. */
export function parseAmountToCents(raw: string): number | null {
  let value = raw.trim()
  if (!value) return null

  let negative = false
  if (value.startsWith('(') && value.endsWith(')')) {
    negative = true
    value = value.slice(1, -1)
  }
  if (value.startsWith('-') || value.startsWith('−')) {
    negative = true
    value = value.slice(1)
  }
  if (value.startsWith('+')) value = value.slice(1)

  value = value.replace(/[$AUD\s,]/gi, '')
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null

  const [whole, frac = ''] = value.split('.')
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2))
  return negative ? -cents : cents
}

export function resolveSignedAmount(args: {
  amount?: string
  debit?: string
  credit?: string
  direction?: string
}): number | null {
  const { amount, debit, credit, direction } = args

  if (debit != null || credit != null) {
    const d = debit?.trim() ? parseAmountToCents(debit) : 0
    const c = credit?.trim() ? parseAmountToCents(credit) : 0
    if (d == null || c == null) return null
    const debitAbs = Math.abs(d ?? 0)
    const creditAbs = Math.abs(c ?? 0)
    if (debitAbs && creditAbs) return null
    if (debitAbs) return -debitAbs
    if (creditAbs) return creditAbs
    return 0
  }

  if (amount == null) return null
  let cents = parseAmountToCents(amount)
  if (cents == null) return null

  if (direction) {
    const dir = direction.trim().toLowerCase()
    const outbound = ['debit', 'dr', 'withdrawal', 'out', 'expense', 'money out'].includes(dir)
    const inbound = ['credit', 'cr', 'deposit', 'in', 'income', 'money in'].includes(dir)
    if (outbound) cents = -Math.abs(cents)
    if (inbound) cents = Math.abs(cents)
  }

  return cents
}

const STRIP_PATTERNS = [
  /\b\d{4}[\s*]?\d{4}[\s*]?\d{4}[\s*]?\d{4}\b/g,
  /\bVISA PURCHASE\b/gi,
  /\bEFTPOS\b/gi,
  /\bDEBIT CARD PURCHASE\b/gi,
  /\bVALUE DATE\b/gi,
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
]

const STRIP_PREFIXES = [/^SQ \*/i, /^SP \*/i, /^PAYPAL \*/i, /^TFR /i, /^DIRECT DEBIT /i]

/** Spec §5.5 merchant normalisation — never overwrite raw description. */
export function normaliseMerchant(description: string): string {
  let value = description.toUpperCase()
  for (const re of STRIP_PATTERNS) value = value.replace(re, ' ')
  for (const re of STRIP_PREFIXES) value = value.replace(re, ' ')
  value = value.replace(
    /\s+[A-Z][A-Z0-9]*\s+(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s*$/g,
    '',
  )
  value = value.replace(/\s+AU\s*$/g, '')
  return value.replace(/\s+/g, ' ').trim()
}
