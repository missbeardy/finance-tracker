/**
 * Macro-bucket layer for the Budget page's "Allocate the pool" section.
 *
 * The `categories` table already has one level of grouping (parent → child,
 * e.g. Food → Groceries/Takeaway/Alcohol/Restaurants). That's still ~9 parent
 * groups and 30+ leaf rows — too granular to scan at a glance. This adds a
 * second, coarser layer purely for UI grouping/progressive disclosure. It is
 * NOT a schema change: it's a static lookup from existing parent category
 * names to one of a handful of behavioural buckets, so it can be dropped in
 * without touching `categories` or migrating data.
 */

export type MacroGroupKey = 'essentials' | 'food' | 'lifestyle' | 'financial'

export type MacroGroupMeta = {
  key: MacroGroupKey
  label: string
  blurb: string
  colorToken: string
}

export const MACRO_GROUPS: Record<MacroGroupKey, MacroGroupMeta> = {
  essentials: {
    key: 'essentials',
    label: 'Essentials',
    blurb: 'Housing, utilities, transport, health — keeps the lights on',
    colorToken: 'cat-3',
  },
  food: {
    key: 'food',
    label: 'Food & Dining',
    blurb: 'Groceries through to takeaway, restaurants and drinks',
    colorToken: 'cat-2',
  },
  lifestyle: {
    key: 'lifestyle',
    label: 'Lifestyle & Discretionary',
    blurb: 'Subscriptions, shopping, hobbies, personal care',
    colorToken: 'cat-7',
  },
  financial: {
    key: 'financial',
    label: 'Fees & Financial Admin',
    blurb: 'Bank fees, interest, loan repayments — money leaking out unseen',
    colorToken: 'cat-8',
  },
}

/**
 * Maps an existing top-level category name (from `categories.seed.ts`) to a
 * macro bucket. Falls back to `lifestyle` for anything unrecognised so a new
 * parent category never disappears from the UI silently.
 */
const PARENT_TO_MACRO: Record<string, MacroGroupKey> = {
  Housing: 'essentials',
  Utilities: 'essentials',
  Transport: 'essentials',
  Health: 'essentials',
  Food: 'food',
  Subscriptions: 'lifestyle',
  Shopping: 'lifestyle',
  Personal: 'lifestyle',
  Financial: 'financial',
}

export function macroGroupForParentName(parentName: string): MacroGroupKey {
  return PARENT_TO_MACRO[parentName] ?? 'lifestyle'
}
