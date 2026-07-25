import type { TransferTxn, AccountPattern } from '@/lib/ledger/transfers'

/** Spec §13 fixtures for transfer matching (cases 1–5). */
export function buildTransferFixtures(): {
  accounts: AccountPattern[]
  txns: TransferTxn[]
} {
  const accounts: AccountPattern[] = [
    {
      id: 1,
      name: 'Darren Daily',
      isOwn: true,
      type: 'transaction',
      externalMatchPatterns: [],
    },
    {
      id: 2,
      name: 'Offset 5',
      isOwn: true,
      type: 'offset',
      externalMatchPatterns: [],
    },
    {
      id: 3,
      name: 'House Offset',
      isOwn: true,
      type: 'offset',
      externalMatchPatterns: [],
    },
    {
      id: 4,
      name: 'ING Credit Card',
      isOwn: true,
      type: 'credit_card',
      externalMatchPatterns: [],
    },
    {
      id: 5,
      name: 'Mortgage Loan',
      isOwn: true,
      type: 'loan',
      externalMatchPatterns: ['MORTGAGE', 'HOME LOAN'],
    },
    {
      id: 6,
      name: 'External Broker',
      isOwn: false,
      type: 'transaction',
      externalMatchPatterns: [],
    },
  ]

  const txns: TransferTxn[] = [
    // 1. Same-day exact transfer
    {
      id: 101,
      accountId: 1,
      date: '2026-06-14',
      amount: -120000,
      description: 'OSKO PAYMENT TO OFFSET 5',
      merchant: 'OSKO PAYMENT TO OFFSET 5',
      transferId: null,
      isOwn: true,
      accountName: 'Darren Daily',
    },
    {
      id: 102,
      accountId: 2,
      date: '2026-06-14',
      amount: 120000,
      description: 'OSKO DEPOSIT',
      merchant: 'OSKO DEPOSIT',
      transferId: null,
      isOwn: true,
      accountName: 'Offset 5',
    },
    // 2. Transfer split across 3 days
    {
      id: 201,
      accountId: 1,
      date: '2026-06-10',
      amount: -50000,
      description: 'TRANSFER TO HOUSE OFFSET',
      merchant: 'TRANSFER TO HOUSE OFFSET',
      transferId: null,
      isOwn: true,
      accountName: 'Darren Daily',
    },
    {
      id: 202,
      accountId: 3,
      date: '2026-06-13',
      amount: 50000,
      description: 'TRANSFER FROM DAILY',
      merchant: 'TRANSFER FROM DAILY',
      transferId: null,
      isOwn: true,
      accountName: 'House Offset',
    },
    // 3. Two identical-amount transfers same day different pairs
    {
      id: 301,
      accountId: 1,
      date: '2026-06-20',
      amount: -20000,
      description: 'TFR TO OFFSET 5',
      merchant: 'TFR TO OFFSET 5',
      transferId: null,
      isOwn: true,
      accountName: 'Darren Daily',
    },
    {
      id: 302,
      accountId: 2,
      date: '2026-06-20',
      amount: 20000,
      description: 'TFR FROM DARREN DAILY',
      merchant: 'TFR FROM DARREN DAILY',
      transferId: null,
      isOwn: true,
      accountName: 'Offset 5',
    },
    {
      id: 303,
      accountId: 1,
      date: '2026-06-20',
      amount: -20000,
      description: 'TFR TO HOUSE OFFSET',
      merchant: 'TFR TO HOUSE OFFSET',
      transferId: null,
      isOwn: true,
      accountName: 'Darren Daily',
    },
    {
      id: 304,
      accountId: 3,
      date: '2026-06-20',
      amount: 20000,
      description: 'TFR FROM DARREN',
      merchant: 'TFR FROM DARREN',
      transferId: null,
      isOwn: true,
      accountName: 'House Offset',
    },
    // 4. One-sided to non-imported mortgage via pattern
    {
      id: 401,
      accountId: 2,
      date: '2026-06-01',
      amount: -210000,
      description: 'DIRECT DEBIT MORTGAGE LOAN',
      merchant: 'DIRECT DEBIT MORTGAGE LOAN',
      transferId: null,
      isOwn: true,
      accountName: 'Offset 5',
    },
    // 5. Card purchase + later payment
    {
      id: 501,
      accountId: 4,
      date: '2026-06-05',
      amount: -8999,
      description: 'WOOLWORTHS ONLINE',
      merchant: 'WOOLWORTHS ONLINE',
      transferId: null,
      isOwn: true,
      accountName: 'ING Credit Card',
    },
    {
      id: 502,
      accountId: 1,
      date: '2026-06-20',
      amount: -45000,
      description: 'CREDIT CARD PAYMENT ING',
      merchant: 'CREDIT CARD PAYMENT ING',
      transferId: null,
      isOwn: true,
      accountName: 'Darren Daily',
    },
    {
      id: 503,
      accountId: 4,
      date: '2026-06-21',
      amount: 45000,
      description: 'PAYMENT RECEIVED THANK YOU',
      merchant: 'PAYMENT RECEIVED THANK YOU',
      transferId: null,
      isOwn: true,
      accountName: 'ING Credit Card',
    },
  ]

  return { accounts, txns }
}
