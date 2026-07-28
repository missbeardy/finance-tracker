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
  'cat-1': '#00E5FF',
  'cat-2': '#FF2D95',
  'cat-3': '#FACC15',
  'cat-4': '#39FF14',
  'cat-5': '#FF6B00',
  'cat-6': '#38BDF8',
  'cat-7': '#F472B6',
  'cat-8': '#94A3B8',
}
