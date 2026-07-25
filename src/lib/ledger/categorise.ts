export type RuleMatchType = 'contains' | 'starts_with' | 'regex' | 'exact_merchant'

export type CategoriseRule = {
  id: number
  priority: number
  matchType: RuleMatchType
  pattern: string
  accountScope: number | null
  amountMin: number | null
  amountMax: number | null
  categoryId: number
  enabled: boolean
}

export type CategoriseInput = {
  merchant: string
  description: string
  accountId: number
  amount: number
}

/** First matching rule by ascending priority wins. */
export function matchCategory(
  input: CategoriseInput,
  rules: CategoriseRule[],
): { categoryId: number; ruleId: number } | null {
  const sorted = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority)

  const merchant = input.merchant.toUpperCase()
  const description = input.description.toUpperCase()

  for (const rule of sorted) {
    if (rule.accountScope != null && rule.accountScope !== input.accountId) continue
    if (rule.amountMin != null && Math.abs(input.amount) < rule.amountMin) continue
    if (rule.amountMax != null && Math.abs(input.amount) > rule.amountMax) continue

    const pattern = rule.pattern
    let hit = false

    switch (rule.matchType) {
      case 'exact_merchant':
        hit = merchant === pattern.toUpperCase()
        break
      case 'starts_with':
        hit =
          merchant.startsWith(pattern.toUpperCase()) ||
          description.startsWith(pattern.toUpperCase())
        break
      case 'contains':
        hit =
          merchant.includes(pattern.toUpperCase()) ||
          description.includes(pattern.toUpperCase())
        break
      case 'regex':
        try {
          const re = new RegExp(pattern, 'i')
          hit = re.test(merchant) || re.test(description)
        } catch {
          hit = false
        }
        break
    }

    if (hit) return { categoryId: rule.categoryId, ruleId: rule.id }
  }

  return null
}
