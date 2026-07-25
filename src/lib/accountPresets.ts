import type { AccountType } from '@/lib/accounts'
import type { ColorToken } from '@/lib/accounts'

export type AccountPreset = {
  name: string
  institution: string
  type: AccountType
  is_own: boolean
  is_imported: boolean
  external_match_patterns: string[]
  color_token: ColorToken
  note?: string
}

/**
 * Darren's real account set (Jul 2026).
 * "Hose Offset" interpreted as House Offset.
 * Fire Extinguisher = ING staging account used to pay the credit card.
 */
export const DARREN_ACCOUNT_PRESET: AccountPreset[] = [
  {
    name: 'ING Credit Card',
    institution: 'ING',
    type: 'credit_card',
    is_own: true,
    is_imported: true,
    external_match_patterns: [],
    color_token: 'cat-7',
  },
  {
    name: 'ING Fire Extinguisher',
    institution: 'ING',
    type: 'transaction',
    is_own: true,
    is_imported: true,
    external_match_patterns: ['FIRE EXTINGUISHER', 'FIRE EXTINGISER'],
    color_token: 'cat-6',
    note: 'Staging account — transfers here then out to the credit card',
  },
  {
    name: 'Commonwealth Savings',
    institution: 'Commonwealth Bank',
    type: 'savings',
    is_own: true,
    is_imported: true,
    external_match_patterns: ['COMMONWEALTH', 'CBA', 'COMMBANK'],
    color_token: 'cat-3',
    note: 'Bills account with debit card attached',
  },
  {
    name: 'Darren Daily',
    institution: 'Queensland Country Bank',
    type: 'transaction',
    is_own: true,
    is_imported: true,
    external_match_patterns: [],
    color_token: 'cat-1',
  },
  {
    name: 'Chantelle Daily',
    institution: 'Queensland Country Bank',
    type: 'transaction',
    is_own: true,
    is_imported: true,
    external_match_patterns: [],
    color_token: 'cat-4',
  },
  {
    name: 'House Offset',
    institution: 'Queensland Country Bank',
    type: 'offset',
    is_own: true,
    is_imported: true,
    external_match_patterns: ['HOUSE OFFSET', 'HOSE OFFSET'],
    color_token: 'cat-2',
  },
  {
    name: 'Bills',
    institution: 'Queensland Country Bank',
    type: 'transaction',
    is_own: true,
    is_imported: true,
    external_match_patterns: [],
    color_token: 'cat-5',
  },
  {
    name: 'Offset 5',
    institution: 'Queensland Country Bank',
    type: 'offset',
    is_own: true,
    is_imported: true,
    external_match_patterns: ['OFFSET 5', 'OFFSET5'],
    color_token: 'cat-6',
    note: 'Pay lands here',
  },
  {
    name: 'Mortgage Loan',
    institution: 'Queensland Country Bank',
    type: 'loan',
    is_own: true,
    is_imported: true,
    external_match_patterns: ['MORTGAGE', 'HOME LOAN'],
    color_token: 'cat-8',
    note: 'Mortgage balance — payments in are transfers, not spending',
  },
]
