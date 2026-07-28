/** Playful category icons — emoji used as subtle affordances, never alone for meaning. */
const CATEGORY_EMOJI: Record<string, string> = {
  Housing: '🏠',
  Utilities: '⚡',
  Food: '🍔',
  Transport: '🚗',
  Health: '💊',
  Subscriptions: '📺',
  Shopping: '🛍️',
  Personal: '✨',
  Entertainment: '🎬',
  Education: '📚',
  Travel: '✈️',
  Insurance: '🛡️',
  Income: '💰',
  Salary: '💼',
  'Interest & Dividends': '📈',
  Transfers: '🔄',
  'Cash Withdrawal': '💵',
  Uncategorised: '❓',
  Other: '📦',
  Essentials: '🏠',
  'Food & Dining': '🍔',
  'Lifestyle & Discretionary': '✨',
  'Fees & Financial Admin': '💳',
  Lifestyle: '✨',
  Financial: '💳',
}

export function categoryEmoji(name: string | null | undefined): string {
  if (!name) return '📦'
  if (name in CATEGORY_EMOJI) return CATEGORY_EMOJI[name]!
  const lower = name.toLowerCase()
  if (lower.includes('food') || lower.includes('groc') || lower.includes('cafe')) return '🍔'
  if (lower.includes('fuel') || lower.includes('transport') || lower.includes('uber')) return '🚗'
  if (lower.includes('rent') || lower.includes('mortgage') || lower.includes('home')) return '🏠'
  if (lower.includes('salary') || lower.includes('wage') || lower.includes('pay')) return '💼'
  if (lower.includes('stream') || lower.includes('netflix') || lower.includes('spotify')) return '📺'
  return '✨'
}
