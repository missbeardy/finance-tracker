import { supabase } from '@/lib/supabase'
import { formatAud } from '@/lib/money'

/** Export ledger transactions as CSV (Excel-friendly). */
export async function exportTransactionsCsv(): Promise<Blob> {
  if (!supabase) throw new Error('Supabase is not configured')

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'date, posted_date, amount, description, merchant, balance, status, category_source, accounts(name), categories(name)',
    )
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .limit(20000)
  if (error) throw error

  const header = [
    'date',
    'posted_date',
    'account',
    'merchant',
    'description',
    'amount',
    'amount_formatted',
    'balance',
    'category',
    'category_source',
    'status',
  ]

  const lines = [header.join(',')]
  for (const row of data ?? []) {
    const accounts = row.accounts as { name: string } | null
    const categories = row.categories as { name: string } | null
    lines.push(
      [
        csvCell(row.date),
        csvCell(row.posted_date ?? ''),
        csvCell(accounts?.name ?? ''),
        csvCell(row.merchant),
        csvCell(row.description),
        csvCell(String(row.amount / 100)),
        csvCell(formatAud(row.amount)),
        csvCell(row.balance != null ? String(row.balance / 100) : ''),
        csvCell(categories?.name ?? ''),
        csvCell(row.category_source ?? ''),
        csvCell(row.status),
      ].join(','),
    )
  }

  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
}

export function downloadTransactionsCsv(blob: Blob, filename?: string) {
  const stamp = new Date().toISOString().slice(0, 10)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `finance-tracker-transactions-${stamp}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}
