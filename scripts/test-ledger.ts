import { selectRowsToInsert, type IncomingTxn } from '../src/lib/ledger/dedupe.ts'
import { matchTransfers } from '../src/lib/ledger/transfers.ts'
import { matchCategory } from '../src/lib/ledger/categorise.ts'
import { suggestRulePattern } from '../src/lib/ledger/suggestRulePattern.ts'
import { buildTransferFixtures } from '../src/fixtures/seed.ts'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

// Dedupe: two identical coffees same day both keep; re-import skips both
const coffee: IncomingTxn = {
  accountId: 1,
  date: '2026-06-01',
  amount: -450,
  description: 'COFFEE',
  merchant: 'COFFEE',
  dedupeKey: 'coffee-key',
}
{
  const first = selectRowsToInsert([coffee, coffee], new Map())
  assert(first.toInsert.length === 2, 'two legit coffees insert')
  const existing = new Map([['coffee-key', 2]])
  const second = selectRowsToInsert([coffee, coffee], existing)
  assert(second.toInsert.length === 0 && second.duplicatesSkipped === 2, 'reimport skips')
}

// Categorise
{
  const hit = matchCategory(
    { merchant: 'WOOLWORTHS 1234', description: 'VISA WOOLWORTHS', accountId: 1, amount: -5000 },
    [
      {
        id: 1,
        priority: 10,
        matchType: 'contains',
        pattern: 'WOOLWORTHS',
        accountScope: null,
        amountMin: null,
        amountMax: null,
        categoryId: 99,
        enabled: true,
      },
    ],
  )
  assert(hit?.categoryId === 99, 'woolworths rule')
}

{
  assert(
    suggestRulePattern('DBF*ITSOURTIME BEAUDESERT 0724') === 'DBF*ITSOURTIME BEAUDESERT',
    'strip trailing ref digits',
  )
  assert(suggestRulePattern('WOOLWORTHS') === 'WOOLWORTHS', 'keep clean merchant')
}

// Transfers fixtures 1–5
{
  const { accounts, txns } = buildTransferFixtures()
  const result = matchTransfers(txns, accounts)

  const linked = new Set([
    ...result.auto.flatMap((p) => [p.outId, p.inId]),
    ...result.pending.flatMap((p) => [p.outId, p.inId]),
  ])

  assert(linked.has(101) && linked.has(102), 'case1 same-day pair')
  assert(linked.has(201) && linked.has(202), 'case2 3-day pair')
  assert(linked.has(301) && linked.has(302), 'case3 pair A')
  assert(linked.has(303) && linked.has(304), 'case3 pair B')
  assert(
    result.patternOneSided.some((p) => p.outId === 401 && p.accountInId === 5),
    'case4 one-sided external account pattern',
  )
  assert(
    !result.patternOneSided.some((p) => p.outId === 402),
    'case4b mortgage repayment is not caught by the loan account pattern',
  )
  assert(!linked.has(402), 'case4b mortgage repayment stays as spending')
  assert(
    !linked.has(403) && !result.patternOneSided.some((p) => p.outId === 403),
    'case4c mortgage repayment does not two-sided-match an imported loan account',
  )
  assert(!linked.has(404), 'case4c loan account leg stays untouched too')
  assert(linked.has(502) && linked.has(503), 'case5 card payment')
  assert(!linked.has(501), 'case5 purchase stays spending')
}

console.log('PASS: ledger dedupe, categorise, transfer fixtures 1–5')
