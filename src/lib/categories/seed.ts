type SeedChild = { name: string; kind: 'expense' | 'income' | 'transfer' | 'system'; isOpaque?: boolean; isSystem?: boolean }
type SeedParent = {
  name: string
  kind: 'expense' | 'income' | 'transfer' | 'system'
  colorToken: string
  isSystem?: boolean
  children?: SeedChild[]
}

/** Spec §3 category seed set. */
export const CATEGORY_SEED: SeedParent[] = [
  {
    name: 'Housing',
    kind: 'expense',
    colorToken: 'cat-1',
    children: [
      { name: 'Rent/Mortgage', kind: 'expense' },
      { name: 'Rates & Strata', kind: 'expense' },
      { name: 'Home Insurance', kind: 'expense' },
      { name: 'Repairs', kind: 'expense' },
    ],
  },
  {
    name: 'Utilities',
    kind: 'expense',
    colorToken: 'cat-3',
    children: [
      { name: 'Electricity', kind: 'expense' },
      { name: 'Gas', kind: 'expense' },
      { name: 'Water', kind: 'expense' },
      { name: 'Internet', kind: 'expense' },
      { name: 'Mobile', kind: 'expense' },
    ],
  },
  {
    name: 'Food',
    kind: 'expense',
    colorToken: 'cat-2',
    children: [
      { name: 'Groceries', kind: 'expense' },
      { name: 'Takeaway & Delivery', kind: 'expense' },
      { name: 'Restaurants & Cafes', kind: 'expense' },
      { name: 'Alcohol', kind: 'expense' },
    ],
  },
  {
    name: 'Transport',
    kind: 'expense',
    colorToken: 'cat-5',
    children: [
      { name: 'Fuel', kind: 'expense' },
      { name: 'Rego & Insurance', kind: 'expense' },
      { name: 'Servicing', kind: 'expense' },
      { name: 'Tolls & Parking', kind: 'expense' },
      { name: 'Public Transport', kind: 'expense' },
    ],
  },
  {
    name: 'Health',
    kind: 'expense',
    colorToken: 'cat-4',
    children: [
      { name: 'Health Insurance', kind: 'expense' },
      { name: 'Medical', kind: 'expense' },
      { name: 'Pharmacy', kind: 'expense' },
      { name: 'Fitness', kind: 'expense' },
    ],
  },
  {
    name: 'Subscriptions',
    kind: 'expense',
    colorToken: 'cat-6',
    children: [
      { name: 'Streaming', kind: 'expense' },
      { name: 'Software', kind: 'expense' },
      { name: 'Memberships', kind: 'expense' },
    ],
  },
  {
    name: 'Shopping',
    kind: 'expense',
    colorToken: 'cat-7',
    children: [
      { name: 'Clothing', kind: 'expense' },
      { name: 'Household', kind: 'expense' },
      { name: 'Electronics', kind: 'expense' },
      { name: 'Gifts', kind: 'expense' },
    ],
  },
  {
    name: 'Personal',
    kind: 'expense',
    colorToken: 'cat-1',
    children: [
      { name: 'Hair & Beauty', kind: 'expense' },
      { name: 'Hobbies', kind: 'expense' },
      { name: 'Pets', kind: 'expense' },
    ],
  },
  {
    name: 'Financial',
    kind: 'expense',
    colorToken: 'cat-8',
    children: [
      { name: 'Interest', kind: 'expense' },
      { name: 'Bank Fees', kind: 'expense' },
      { name: 'Loan Repayment', kind: 'expense' },
      { name: 'Investment Contribution', kind: 'expense' },
    ],
  },
  {
    name: 'Income',
    kind: 'income',
    colorToken: 'cat-2',
    children: [
      { name: 'Salary', kind: 'income' },
      { name: 'Interest Earned', kind: 'income' },
      { name: 'Refunds', kind: 'income' },
      { name: 'Other Income', kind: 'income' },
    ],
  },
  { name: 'Uncategorised', kind: 'system', colorToken: 'cat-8', isSystem: true },
  {
    name: 'Internal Transfer',
    kind: 'transfer',
    colorToken: 'cat-8',
    isSystem: true,
  },
  {
    name: 'Cash Withdrawal',
    kind: 'system',
    colorToken: 'cat-8',
    isSystem: true,
  },
]

// Mark Cash Withdrawal opaque via bootstrap insert flags — see ensureUserBootstrap
export const OPAQUE_CATEGORY_NAMES = new Set(['Cash Withdrawal'])
