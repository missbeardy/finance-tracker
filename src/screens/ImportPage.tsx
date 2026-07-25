import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import { useQueryClient } from '@tanstack/react-query'
import { useAccounts, useCreateAccount } from '@/hooks/useAccounts'
import { ACCOUNT_TYPES, COLOR_TOKENS, type AccountType } from '@/lib/accounts'
import {
  detectColumnMapping,
  detectDateFormat,
  normaliseMerchant,
  parseDateToIso,
  resolveSignedAmount,
  type ColumnMapping,
  type CsvField,
  type DateFormat,
} from '@/lib/csv/mapping'
import { suggestAccountMap } from '@/lib/csv/accountMatch'
import { formatAud } from '@/lib/money'
import { commitImport } from '@/lib/import/commit'
import { sha1Hex } from '@/lib/ledger/dedupe'
import { useSettings, useUpdateSettings } from '@/hooks/useSettings'
import type { Json } from '@/types/database'

type Step = 'drop' | 'map' | 'done'

type NormalisedRow = {
  accountId: number
  date: string
  amount: number
  description: string
  merchant: string
  balance: number | null
  accountLabel: string | null
  categoryHint: string | null
}

type MappingProfile = {
  mapping: ColumnMapping
  dateFormat: DateFormat
  accountLabelMap?: Record<string, number>
}

const FIELD_OPTIONS: { value: CsvField; label: string }[] = [
  { value: 'skip', label: 'Ignore' },
  { value: 'date', label: 'Date' },
  { value: 'posted_date', label: 'Posted date' },
  { value: 'amount', label: 'Amount (signed)' },
  { value: 'debit', label: 'Debit' },
  { value: 'credit', label: 'Credit' },
  { value: 'direction', label: 'Direction' },
  { value: 'description', label: 'Description' },
  { value: 'balance', label: 'Balance' },
  { value: 'account', label: 'Account' },
  { value: 'category', label: 'Category hint' },
]

export function ImportPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const preselectedAccountId = Number(params.get('accountId') || '') || null
  const { data: accounts = [] } = useAccounts()
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const createAccount = useCreateAccount()

  const [step, setStep] = useState<Step>('drop')
  const [filename, setFilename] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [dateFormat, setDateFormat] = useState<DateFormat>('DD/MM/YYYY')
  const [accountId, setAccountId] = useState<number | null>(preselectedAccountId)
  const [accountLabelMap, setAccountLabelMap] = useState<Record<string, number | null>>({})
  const [error, setError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const [resultSummary, setResultSummary] = useState<string | null>(null)
  const [headerHash, setHeaderHash] = useState<string | null>(null)
  const [creatingLabel, setCreatingLabel] = useState<string | null>(null)
  const [createDraft, setCreateDraft] = useState<{
    name: string
    institution: string
    type: AccountType
  }>({ name: '', institution: '', type: 'transaction' })
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const accountCol = useMemo(
    () => headers.find((h) => mapping[h] === 'account') ?? null,
    [headers, mapping],
  )
  const multiAccount = Boolean(accountCol)

  const distinctLabels = useMemo(() => {
    if (!accountCol) return [] as string[]
    const set = new Set<string>()
    for (const row of rows) {
      const label = (row[accountCol] ?? '').trim()
      if (label) set.add(label)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [rows, accountCol])

  // Not part of the formal column mapping — just used to prefill institution/type
  // when offering to create an account for an unmatched CSV label (e.g. WeMoney's
  // "bank" and "accountType" columns).
  const bankCol = useMemo(
    () => headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, '') === 'bank') ?? null,
    [headers],
  )
  const accountTypeCol = useMemo(
    () => headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, '') === 'accounttype') ?? null,
    [headers],
  )
  const labelMeta = useMemo(() => {
    const map = new Map<string, { bank: string; accountType: string }>()
    if (!accountCol) return map
    for (const row of rows) {
      const label = (row[accountCol] ?? '').trim()
      if (!label || map.has(label)) continue
      map.set(label, {
        bank: bankCol ? (row[bankCol] ?? '').trim() : '',
        accountType: accountTypeCol ? (row[accountTypeCol] ?? '').trim() : '',
      })
    }
    return map
  }, [rows, accountCol, bankCol, accountTypeCol])

  useEffect(() => {
    if (!multiAccount || !distinctLabels.length || !accounts.length) return
    setAccountLabelMap((prev) => {
      const next = { ...prev }
      let changed = false
      const suggestions = suggestAccountMap(distinctLabels, accounts)
      for (const label of distinctLabels) {
        if (next[label] == null && suggestions[label] != null) {
          next[label] = suggestions[label]
          changed = true
        }
        if (!(label in next)) {
          next[label] = suggestions[label] ?? null
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [multiAccount, distinctLabels, accounts])

  async function onFile(file: File) {
    setError(null)
    setResultSummary(null)
    setFilename(file.name)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        void (async () => {
          if (result.errors.length) {
            setError(result.errors[0]?.message ?? 'Could not parse CSV')
            return
          }
          const cols = result.meta.fields?.filter(Boolean) ?? []
          if (!cols.length) {
            setError('No header row found. Check the CSV export.')
            return
          }
          const data = result.data
          const hash = await sha1Hex(cols.join('|'))
          setHeaderHash(hash)

          const saved = (settings?.import_mappings ?? {}) as Record<string, MappingProfile>
          const profile = saved[hash]
          const detected = profile?.mapping ?? detectColumnMapping(cols)
          setHeaders(cols)
          setRows(data)
          setMapping(detected)

          const dateHeader = cols.find((h) => detected[h] === 'date')
          const dateSamples = dateHeader
            ? data.slice(0, 40).map((r) => r[dateHeader] ?? '')
            : []
          const detectedFormat =
            profile?.dateFormat ??
            (() => {
              const d = detectDateFormat(dateSamples)
              return d === 'ambiguous' ? 'DD/MM/YYYY' : d
            })()
          setDateFormat(detectedFormat)

          if (profile?.accountLabelMap) {
            setAccountLabelMap(profile.accountLabelMap)
          } else {
            setAccountLabelMap({})
          }
          setStep('map')
        })()
      },
    })
  }

  function guessAccountType(raw: string): AccountType {
    const v = raw.toLowerCase()
    if (v.includes('credit')) return 'credit_card'
    if (v.includes('loan')) return 'loan'
    if (v.includes('offset')) return 'offset'
    if (v.includes('invest')) return 'investment'
    if (v.includes('saving')) return 'savings'
    return 'transaction'
  }

  function openCreateAccount(label: string) {
    const meta = labelMeta.get(label)
    setCreateDraft({
      name: label,
      institution: meta?.bank ?? '',
      type: guessAccountType(meta?.accountType ?? ''),
    })
    setCreateError(null)
    setCreatingLabel(label)
  }

  async function confirmCreateAccount() {
    if (!creatingLabel) return
    if (!createDraft.name.trim() || !createDraft.institution.trim()) {
      setCreateError('Name and institution are required.')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const colorToken =
        COLOR_TOKENS[distinctLabels.indexOf(creatingLabel) % COLOR_TOKENS.length] ?? 'cat-6'
      const created = await createAccount.mutateAsync({
        name: createDraft.name.trim(),
        institution: createDraft.institution.trim(),
        type: createDraft.type,
        is_own: true,
        is_imported: true,
        external_match_patterns: [],
        color_token: colorToken,
        currency: 'AUD',
      })
      setAccountLabelMap((prev) => ({ ...prev, [creatingLabel]: created.id }))
      setCreatingLabel(null)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create account')
    } finally {
      setCreating(false)
    }
  }

  const normalised = useMemo(() => {
    const byField = (field: CsvField) =>
      headers.find((h) => mapping[h] === field) ?? null

    const dateCol = byField('date')
    const amountCol = byField('amount')
    const debitCol = byField('debit')
    const creditCol = byField('credit')
    const directionCol = byField('direction')
    const descCol = byField('description')
    const balanceCol = byField('balance')
    const accCol = byField('account')
    const categoryCol = byField('category')

    const out: NormalisedRow[] = []
    const problems: string[] = []
    let unmappedAccountRows = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!dateCol || !descCol) break

      let rowAccountId: number | null = null
      let accountLabel: string | null = null
      if (accCol) {
        accountLabel = (row[accCol] ?? '').trim() || null
        rowAccountId = accountLabel ? (accountLabelMap[accountLabel] ?? null) : null
        if (!rowAccountId) {
          unmappedAccountRows += 1
          continue
        }
      } else {
        rowAccountId = accountId
        if (!rowAccountId) break
      }

      const date = parseDateToIso(row[dateCol] ?? '', dateFormat)
      if (!date) {
        problems.push(`Row ${i + 2} has no valid date. Check the date column mapping.`)
        continue
      }
      const amount = resolveSignedAmount({
        amount: amountCol ? row[amountCol] : undefined,
        debit: debitCol ? row[debitCol] : undefined,
        credit: creditCol ? row[creditCol] : undefined,
        direction: directionCol ? row[directionCol] : undefined,
      })
      if (amount == null) {
        problems.push(`Row ${i + 2} has no valid amount.`)
        continue
      }
      const description = (row[descCol] ?? '').trim()
      if (!description) {
        problems.push(`Row ${i + 2} has an empty description.`)
        continue
      }
      const balanceRaw = balanceCol ? row[balanceCol] : ''
      const balance = balanceRaw
        ? resolveSignedAmount({ amount: balanceRaw })
        : null

      out.push({
        accountId: rowAccountId,
        date,
        amount,
        description,
        merchant: normaliseMerchant(description),
        balance,
        accountLabel,
        categoryHint: categoryCol ? (row[categoryCol] ?? null) : null,
      })
    }

    if (unmappedAccountRows > 0) {
      problems.unshift(
        `${unmappedAccountRows} rows skipped — map every account name below before committing.`,
      )
    }

    return { out, problems }
  }, [rows, headers, mapping, dateFormat, accountId, accountLabelMap])

  const previewRows = normalised.out.slice(0, 8)
  const merchants = new Set(normalised.out.map((r) => r.merchant)).size
  const accountsUsed = new Set(normalised.out.map((r) => r.accountId)).size

  const allLabelsMapped =
    !multiAccount ||
    distinctLabels.every((label) => typeof accountLabelMap[label] === 'number')

  const canCommit =
    (multiAccount ? allLabelsMapped : Boolean(accountId)) &&
    Object.values(mapping).includes('date') &&
    Object.values(mapping).includes('description') &&
    (Object.values(mapping).includes('amount') ||
      (Object.values(mapping).includes('debit') &&
        Object.values(mapping).includes('credit'))) &&
    normalised.out.length > 0

  async function handleCommit() {
    if (!canCommit) return
    setCommitting(true)
    setError(null)
    try {
      const labelMapSaved: Record<string, number> = {}
      for (const [label, id] of Object.entries(accountLabelMap)) {
        if (typeof id === 'number') labelMapSaved[label] = id
      }

      if (headerHash) {
        const existing = (settings?.import_mappings ?? {}) as Record<string, Json>
        await updateSettings.mutateAsync({
          import_mappings: {
            ...existing,
            [headerHash]: {
              mapping,
              dateFormat,
              accountLabelMap: labelMapSaved,
            },
          },
        })
      }

      const result = await commitImport({
        filename,
        accountId: multiAccount ? null : accountId,
        mappingProfileHash: headerHash,
        rows: normalised.out.map((r) => ({
          accountId: r.accountId,
          date: r.date,
          amount: r.amount,
          description: r.description,
          merchant: r.merchant,
          balance: r.balance,
          categoryHint: r.categoryHint,
        })),
      })

      await qc.invalidateQueries({ queryKey: ['transactions'] })
      await qc.invalidateQueries({ queryKey: ['imports'] })

      setResultSummary(
        `Imported ${result.inserted} rows across ${accountsUsed} account${accountsUsed === 1 ? '' : 's'}` +
          (result.duplicatesSkipped ? `, skipped ${result.duplicatesSkipped} duplicates` : '') +
          (result.dateMin && result.dateMax
            ? ` · ${result.dateMin} – ${result.dateMax}`
            : '') +
          (result.transfersAuto || result.transfersPending
            ? ` · ${result.transfersAuto} transfers linked, ${result.transfersPending} need review`
            : ''),
      )
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setCommitting(false)
    }
  }

  const accountNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const a of accounts) map.set(a.id, a.name)
    return map
  }, [accounts])

  return (
    <section className="space-y-6">
      <div>
        <Link to="/accounts" className="text-xs font-medium text-flow">
          ← Accounts
        </Link>
        <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight text-ink">
          Import transactions
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Drop a CSV (including WeMoney all-accounts). If an Account column is present, map
          each name to your ledger accounts.
        </p>
        <Link to="/imports" className="mt-2 inline-block text-xs text-flow">
          Import history
        </Link>
      </div>

      {step === 'drop' && (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-hairline bg-surface px-4 py-16 text-center">
          <span className="text-sm font-medium text-ink">Drop a CSV here</span>
          <span className="mt-1 text-xs text-ink-muted">or tap to choose a file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onFile(file)
            }}
          />
        </label>
      )}

      {step === 'map' && (
        <>
          <p className="text-xs text-ink-muted">
            File: <span className="ledger-mono text-ink">{filename}</span> · {rows.length}{' '}
            rows
            {multiAccount
              ? ` · ${distinctLabels.length} accounts in file`
              : ' · single-account file'}
          </p>

          <div className="space-y-2 rounded-lg bg-surface p-4">
            <h2 className="text-sm font-medium text-ink">Column mapping</h2>
            {headers.map((header) => (
              <div key={header} className="grid grid-cols-[1fr_1fr] items-center gap-2">
                <span className="truncate text-xs text-ink-muted">{header}</span>
                <select
                  className="field"
                  value={mapping[header] ?? 'skip'}
                  onChange={(e) =>
                    setMapping({ ...mapping, [header]: e.target.value as CsvField })
                  }
                >
                  {FIELD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {multiAccount ? (
            <div className="space-y-3 rounded-lg bg-surface p-4">
              <h2 className="text-sm font-medium text-ink">Map accounts in this file</h2>
              <p className="text-xs text-ink-muted">
                Each distinct Account value is matched to one of your ledger accounts.
                Suggestions are filled automatically when names are close.
              </p>
              {distinctLabels.map((label) => (
                <label key={label} className="block">
                  <span className="mb-1 block truncate text-xs font-medium text-ink-muted">
                    {label}
                  </span>
                  <select
                    className="field"
                    value={accountLabelMap[label] ?? ''}
                    onChange={(e) =>
                      setAccountLabelMap({
                        ...accountLabelMap,
                        [label]: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Select account…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.institution})
                      </option>
                    ))}
                  </select>

                  {accountLabelMap[label] == null && creatingLabel !== label && (
                    <p className="mt-1 text-xs text-caution">
                      No matching account for "{label}".{' '}
                      <button
                        type="button"
                        className="font-medium text-flow underline"
                        onClick={() => openCreateAccount(label)}
                      >
                        Create a new account for it?
                      </button>
                    </p>
                  )}

                  {creatingLabel === label && (
                    <div className="mt-2 space-y-2 rounded-md border border-hairline p-3">
                      <p className="text-xs font-medium text-ink">
                        Create account from "{label}"
                      </p>
                      <input
                        className="field"
                        placeholder="Account name"
                        value={createDraft.name}
                        onChange={(e) =>
                          setCreateDraft({ ...createDraft, name: e.target.value })
                        }
                      />
                      <input
                        className="field"
                        placeholder="Institution"
                        value={createDraft.institution}
                        onChange={(e) =>
                          setCreateDraft({ ...createDraft, institution: e.target.value })
                        }
                      />
                      <select
                        className="field"
                        value={createDraft.type}
                        onChange={(e) =>
                          setCreateDraft({
                            ...createDraft,
                            type: e.target.value as AccountType,
                          })
                        }
                      >
                        {ACCOUNT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      {createError && (
                        <p className="text-xs text-signal" role="alert">
                          {createError}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={creating}
                          className="rounded-md bg-flow px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                          onClick={() => void confirmCreateAccount()}
                        >
                          {creating ? 'Creating…' : 'Create account'}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-hairline px-3 py-1.5 text-xs"
                          onClick={() => {
                            setCreatingLabel(null)
                            setCreateError(null)
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </label>
              ))}
            </div>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-muted">
                Assign whole file to account
              </span>
              <select
                className="field"
                value={accountId ?? ''}
                onChange={(e) => setAccountId(Number(e.target.value) || null)}
              >
                <option value="">Select account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.institution})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Date format</span>
            <select
              className="field"
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value as DateFormat)}
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY (Australia)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </label>

          <div className="overflow-x-auto rounded-lg bg-surface p-3">
            <p className="mb-2 text-xs font-medium text-ink-muted">Live preview</p>
            <table className="w-full min-w-[32rem] text-left text-xs">
              <thead>
                <tr className="text-ink-muted">
                  <th className="py-1 pr-2 font-medium">Date</th>
                  <th className="py-1 pr-2 font-medium">Account</th>
                  <th className="py-1 pr-2 font-medium">Merchant</th>
                  <th className="py-1 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr key={`${row.date}-${row.accountId}-${idx}`} className="border-t border-hairline">
                    <td className="ledger-mono py-1.5 pr-2">{row.date}</td>
                    <td className="py-1.5 pr-2">
                      {accountNameById.get(row.accountId) ?? row.accountLabel ?? '—'}
                    </td>
                    <td className="py-1.5 pr-2">{row.merchant}</td>
                    <td className="ledger-mono py-1.5">{formatAud(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink">
            <p>
              {normalised.out.length} rows ready · {merchants} merchants
              {multiAccount ? ` · ${accountsUsed} accounts` : ''}
              {!canCommit && multiAccount && !allLabelsMapped
                ? ' · finish account mapping'
                : !canCommit && !multiAccount && !accountId
                  ? ' · select an account'
                  : ''}
            </p>
            <button
              type="button"
              disabled={!canCommit || committing || !navigator.onLine}
              className="mt-3 rounded-md bg-flow px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              onClick={() => void handleCommit()}
            >
              {committing
                ? 'Importing…'
                : !navigator.onLine
                  ? 'Offline — connect to import'
                  : 'Commit import'}
            </button>
          </div>

          {normalised.problems.slice(0, 4).map((p) => (
            <p key={p} className="text-xs text-caution">
              {p}
            </p>
          ))}
        </>
      )}

      {step === 'done' && (
        <div className="space-y-4 rounded-lg bg-surface p-4">
          <p className="text-sm text-inbound">{resultSummary}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-flow px-3 py-2 text-sm font-medium text-white"
              onClick={() => navigate('/ledger')}
            >
              Open ledger
            </button>
            <button
              type="button"
              className="rounded-md border border-hairline px-3 py-2 text-sm"
              onClick={() => {
                setStep('drop')
                setRows([])
                setHeaders([])
                setAccountLabelMap({})
                setResultSummary(null)
              }}
            >
              Import another file
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-signal" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
