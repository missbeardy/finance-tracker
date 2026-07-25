export type AccountType =
  | 'transaction'
  | 'savings'
  | 'credit_card'
  | 'offset'
  | 'loan'
  | 'investment'

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'transaction', label: 'Transaction' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'offset', label: 'Offset' },
  { value: 'loan', label: 'Loan' },
  { value: 'investment', label: 'Investment' },
]

export const COLOR_TOKENS = [
  'cat-1',
  'cat-2',
  'cat-3',
  'cat-4',
  'cat-5',
  'cat-6',
  'cat-7',
  'cat-8',
] as const

export type ColorToken = (typeof COLOR_TOKENS)[number]

export const COLOR_TOKEN_HEX: Record<ColorToken, string> = {
  'cat-1': '#7C3AED',
  'cat-2': '#A855F7',
  'cat-3': '#6366F1',
  'cat-4': '#DB2777',
  'cat-5': '#8B5CF6',
  'cat-6': '#4F46E5',
  'cat-7': '#C026D3',
  'cat-8': '#94A3B8',
}
