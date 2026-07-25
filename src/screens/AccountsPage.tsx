import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
} from '@/hooks/useAccounts'
import {
  ACCOUNT_TYPES,
  COLOR_TOKENS,
  COLOR_TOKEN_HEX,
  type AccountType,
  type ColorToken,
} from '@/lib/accounts'
import { DARREN_ACCOUNT_PRESET } from '@/lib/accountPresets'
import { formatAud, parseDollarsToCents } from '@/lib/money'
import type { AccountRow } from '@/hooks/useAccounts'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

type Draft = {
  name: string
  institution: string
  type: AccountType
  is_own: boolean
  is_imported: boolean
  external_match_patterns: string
  opening_balance: string
  color_token: ColorToken
}

const emptyDraft = (): Draft => ({
  name: '',
  institution: '',
  type: 'transaction',
  is_own: true,
  is_imported: true,
  external_match_patterns: '',
  opening_balance: '',
  color_token: 'cat-6',
})

function draftFromAccount(account: AccountRow): Draft {
  return {
    name: account.name,
    institution: account.institution,
    type: account.type as AccountType,
    is_own: account.is_own,
    is_imported: account.is_imported,
    external_match_patterns: account.external_match_patterns.join(', '),
    opening_balance:
      account.opening_balance != null ? (account.opening_balance / 100).toFixed(2) : '',
    color_token: (COLOR_TOKENS.includes(account.color_token as ColorToken)
      ? account.color_token
      : 'cat-6') as ColorToken,
  }
}

export function AccountsPage() {
  const { data: accounts = [], isLoading, error } = useAccounts()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()
  const queryClient = useQueryClient()

  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [formError, setFormError] = useState<string | null>(null)
  const [seedMessage, setSeedMessage] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)

  const title = useMemo(() => {
    if (editingId === 'new') return 'Add account'
    if (editingId != null) return 'Edit account'
    return 'Accounts'
  }, [editingId])

  async function save() {
    setFormError(null)
    if (!draft.name.trim() || !draft.institution.trim()) {
      setFormError('Name and institution are required.')
      return
    }

    const opening =
      draft.opening_balance.trim() === ''
        ? null
        : parseDollarsToCents(draft.opening_balance)
    if (draft.opening_balance.trim() !== '' && opening == null) {
      setFormError('Opening balance must look like 1234.56')
      return
    }

    const patterns = draft.external_match_patterns
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)

    const payload = {
      name: draft.name.trim(),
      institution: draft.institution.trim(),
      type: draft.type,
      is_own: draft.is_own,
      is_imported: draft.is_imported,
      external_match_patterns: patterns,
      opening_balance: opening,
      color_token: draft.color_token,
      currency: 'AUD',
    }

    try {
      if (editingId === 'new') {
        await createAccount.mutateAsync(payload)
      } else if (typeof editingId === 'number') {
        await updateAccount.mutateAsync({ id: editingId, ...payload })
      }
      setEditingId(null)
      setDraft(emptyDraft())
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save account')
    }
  }

  async function seedPresetAccounts() {
    if (!supabase) {
      setFormError('Supabase is not configured')
      return
    }
    setSeeding(true)
    setSeedMessage(null)
    setFormError(null)
    try {
      const existingNames = new Set(accounts.map((a) => a.name.toLowerCase()))
      const toInsert = DARREN_ACCOUNT_PRESET.filter(
        (p) => !existingNames.has(p.name.toLowerCase()),
      ).map((p) => ({
        name: p.name,
        institution: p.institution,
        type: p.type,
        is_own: p.is_own,
        is_imported: p.is_imported,
        external_match_patterns: p.external_match_patterns,
        color_token: p.color_token,
        currency: 'AUD',
      }))

      if (toInsert.length === 0) {
        setSeedMessage('All of your accounts are already set up.')
        return
      }

      const { error: insertError } = await supabase.from('accounts').insert(toInsert)
      if (insertError) throw insertError
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setSeedMessage(`Added ${toInsert.length} accounts.`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add accounts')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <section>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Mark accounts you own but do not import, and add match patterns for one-sided
            transfers.
          </p>
        </div>
        {editingId == null && (
          <button
            type="button"
            className="rounded-md bg-flow px-3 py-2 text-sm font-medium text-white"
            onClick={() => {
              setDraft(emptyDraft())
              setEditingId('new')
              setFormError(null)
            }}
          >
            Add
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading accounts…</p>}
      {error && (
        <p className="text-sm text-signal" role="alert">
          {error.message}
        </p>
      )}

      {editingId != null ? (
        <div className="space-y-3 rounded-lg bg-surface p-4">
          <Field label="Name">
            <input
              className="field"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Everyday Offset"
            />
          </Field>
          <Field label="Institution">
            <input
              className="field"
              value={draft.institution}
              onChange={(e) => setDraft({ ...draft, institution: e.target.value })}
              placeholder="ING"
            />
          </Field>
          <Field label="Type">
            <select
              className="field"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as AccountType })}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Opening balance (optional)">
            <input
              className="field ledger-mono"
              value={draft.opening_balance}
              onChange={(e) => setDraft({ ...draft, opening_balance: e.target.value })}
              placeholder="0.00"
            />
          </Field>
          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {COLOR_TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  aria-label={token}
                  className={`h-8 w-8 rounded-md border ${
                    draft.color_token === token ? 'border-ink' : 'border-hairline'
                  }`}
                  style={{ background: COLOR_TOKEN_HEX[token] }}
                  onClick={() => setDraft({ ...draft, color_token: token })}
                />
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={draft.is_own}
              onChange={(e) => setDraft({ ...draft, is_own: e.target.checked })}
            />
            Own account (transfers here are not spending)
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={draft.is_imported}
              onChange={(e) => setDraft({ ...draft, is_imported: e.target.checked })}
            />
            Import CSV for this account
          </label>
          {!draft.is_imported && (
            <Field label="External match patterns (comma-separated)">
              <input
                className="field"
                value={draft.external_match_patterns}
                onChange={(e) =>
                  setDraft({ ...draft, external_match_patterns: e.target.value })
                }
                placeholder="MORTGAGE OFFSET, UBank Save"
              />
            </Field>
          )}
          {formError && (
            <p className="text-sm text-signal" role="alert">
              {formError}
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="rounded-md bg-flow px-3 py-2 text-sm font-medium text-white"
              onClick={() => void save()}
            >
              Save
            </button>
            <button
              type="button"
              className="rounded-md border border-hairline px-3 py-2 text-sm"
              onClick={() => {
                setEditingId(null)
                setFormError(null)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {accounts.length === 0 && (
            <li className="space-y-3 rounded-lg bg-surface p-4 text-sm text-ink-muted">
              <p>No accounts yet. Load your real set in one tap:</p>
              <ul className="list-inside list-disc text-xs">
                {DARREN_ACCOUNT_PRESET.map((p) => (
                  <li key={p.name}>
                    {p.name} · {p.institution} · {p.type.replace('_', ' ')}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={seeding}
                className="rounded-md bg-flow px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                onClick={() => void seedPresetAccounts()}
              >
                {seeding ? 'Adding…' : 'Add my 9 accounts'}
              </button>
            </li>
          )}
          {accounts.length > 0 &&
            accounts.length < DARREN_ACCOUNT_PRESET.length &&
            editingId == null && (
              <li className="rounded-lg border border-hairline bg-surface p-3 text-xs text-ink-muted">
                Missing some of your preset accounts?{' '}
                <button
                  type="button"
                  className="font-medium text-flow"
                  disabled={seeding}
                  onClick={() => void seedPresetAccounts()}
                >
                  Add the rest
                </button>
              </li>
            )}
          {seedMessage && (
            <li className="text-sm text-inbound" role="status">
              {seedMessage}
            </li>
          )}
          {formError && editingId == null && (
            <li className="text-sm text-signal" role="alert">
              {formError}
            </li>
          )}
          {accounts.map((account) => (
            <li key={account.id} className="rounded-lg bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-3 w-3 rounded-sm"
                    style={{
                      background:
                        COLOR_TOKEN_HEX[(account.color_token as ColorToken) ?? 'cat-6'] ??
                        '#7A7F87',
                    }}
                  />
                  <div>
                    <p className="font-medium text-ink">{account.name}</p>
                    <p className="text-xs text-ink-muted">
                      {account.institution} · {account.type.replace('_', ' ')}
                      {!account.is_imported ? ' · not imported' : ''}
                    </p>
                    {account.opening_balance != null && (
                      <p className="money mt-2 text-lg text-ink">
                        {formatAud(account.opening_balance)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Link
                    to={`/import?accountId=${account.id}`}
                    className="text-xs font-medium text-flow"
                  >
                    Import
                  </Link>
                  <button
                    type="button"
                    className="text-xs text-ink-muted"
                    onClick={() => {
                      setDraft(draftFromAccount(account))
                      setEditingId(account.id)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs text-signal"
                    onClick={() => {
                      if (
                        confirm(
                          `Delete ${account.name}? Transactions on this account will be removed.`,
                        )
                      ) {
                        void deleteAccount.mutateAsync(account.id)
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  )
}
