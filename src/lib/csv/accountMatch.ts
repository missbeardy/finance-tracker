import type { AccountRow } from '@/hooks/useAccounts'

function norm(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(qld|queensland|country|bank|qcb|ing|cba|commonwealth|commbank|account|acct)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Known WeMoney / export aliases → app account names. */
const ALIASES: Record<string, string[]> = {
  'ing credit card': ['ing credit card', 'credit card', 'ing cc', 'ing visa'],
  'ing fire extinguisher': [
    'fire extinguisher',
    'fire extingiser',
    'ing fire',
    'fire extinguisher account',
  ],
  'commonwealth savings': [
    'commonwealth savings',
    'commbank savings',
    'cba savings',
    'commonwealth',
  ],
  'darren daily': ['darren daily', 'darren everyday', 'darren transaction'],
  'chantelle daily': ['chantelle daily', 'chantelle everyday'],
  'house offset': ['house offset', 'hose offset', 'home offset'],
  bills: ['bills', 'bills account', 'qcb bills'],
  'offset 5': ['offset 5', 'offset5', 'pay offset', 'salary offset'],
  'mortgage loan': ['mortgage loan', 'mortgage', 'home loan', 'loan account'],
}

function scoreLabel(csvLabel: string, accountName: string): number {
  const a = norm(csvLabel)
  const b = norm(accountName)
  if (!a || !b) return 0
  if (a === b) return 100
  if (a.includes(b) || b.includes(a)) return 80

  const aliasKey = Object.keys(ALIASES).find((k) => norm(k) === b || b.includes(norm(k)))
  if (aliasKey) {
    for (const alias of ALIASES[aliasKey] ?? []) {
      const n = norm(alias)
      if (a === n) return 95
      if (a.includes(n) || n.includes(a)) return 75
    }
  }

  const aTokens = new Set(a.split(' '))
  const bTokens = b.split(' ')
  const overlap = bTokens.filter((t) => aTokens.has(t)).length
  if (overlap === 0) return 0
  return Math.round((overlap / Math.max(bTokens.length, 1)) * 60)
}

/** Best-effort match of a CSV account label to an existing ledger account. */
export function suggestAccountId(
  csvLabel: string,
  accounts: Pick<AccountRow, 'id' | 'name'>[],
): number | null {
  let best: { id: number; score: number } | null = null
  for (const account of accounts) {
    const score = scoreLabel(csvLabel, account.name)
    if (!best || score > best.score) best = { id: account.id, score }
  }
  return best && best.score >= 50 ? best.id : null
}

export function suggestAccountMap(
  labels: string[],
  accounts: Pick<AccountRow, 'id' | 'name'>[],
): Record<string, number | null> {
  const map: Record<string, number | null> = {}
  for (const label of labels) {
    map[label] = suggestAccountId(label, accounts)
  }
  return map
}
