import {
  detectColumnMapping,
  detectDateFormat,
  normaliseMerchant,
  parseAmountToCents,
  parseDateToIso,
  resolveSignedAmount,
} from '../src/lib/csv/mapping.ts'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

const mapping = detectColumnMapping([
  'Date',
  'Amount',
  'Description',
  'Balance',
  'Category',
])
assert(mapping.Date === 'date', 'date alias')
assert(mapping.Amount === 'amount', 'amount alias')
assert(mapping.Description === 'description', 'description alias')

assert(detectDateFormat(['13/01/2024', '02/03/2024']) === 'DD/MM/YYYY', 'day-first')
assert(detectDateFormat(['01/13/2024', '02/03/2024']) === 'MM/DD/YYYY', 'month-first')
assert(parseDateToIso('25/07/2026', 'DD/MM/YYYY') === '2026-07-25', 'parse DD/MM')
assert(parseAmountToCents('(1,234.56)') === -123456, 'parens negative')
assert(parseAmountToCents('$12.50') === 1250, 'dollar strip')
assert(resolveSignedAmount({ debit: '10.00', credit: '' }) === -1000, 'debit column')
assert(resolveSignedAmount({ debit: '', credit: '10.00' }) === 1000, 'credit column')
assert(
  normaliseMerchant('VISA PURCHASE WOOLWORTHS BEAUDESERT QLD') === 'WOOLWORTHS',
  'merchant normalise',
)

console.log('PASS: csv mapping unit checks')
