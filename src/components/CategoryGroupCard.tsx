import { useState } from 'react'
import { formatAud, parseDollarsToCents } from '@/lib/money'
import { paceDaysDelta } from '@/lib/budget/calc'

export type MicroCategoryLine = {
  id: number
  name: string
  color: string
  allocatedCents: number
  spentCents: number
}

/**
 * Collapsed-by-default macro bucket for the "Allocate the pool" list.
 * Replaces a flat list of per-category rows with one scannable row per
 * bucket (Essentials, Food & Dining, Lifestyle, Financial). Expanding it
 * reveals the underlying micro-categories for the rare case someone needs
 * to nudge one line item — progressive disclosure, not data loss.
 */
export function CategoryGroupCard({
  label,
  blurb,
  color,
  lines,
  periodStart,
  periodEnd,
  today,
  defaultExpanded = false,
  onChangeLine,
  onSaveLine,
}: {
  label: string
  blurb?: string
  color: string
  lines: MicroCategoryLine[]
  periodStart: string
  periodEnd: string
  today: string
  defaultExpanded?: boolean
  onChangeLine: (id: number, cents: number) => void
  onSaveLine: (id: number, cents: number) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const allocatedCents = lines.reduce((s, l) => s + l.allocatedCents, 0)
  const spentCents = lines.reduce((s, l) => s + l.spentCents, 0)
  const over = allocatedCents > 0 && spentCents > allocatedCents
  const pct =
    allocatedCents > 0
      ? Math.min(100, Math.round((spentCents / allocatedCents) * 100))
      : spentCents > 0
        ? 100
        : 0
  const pace = paceDaysDelta({ allocationCents: allocatedCents, spentCents, periodStart, periodEnd, today })

  return (
    <div className="rounded-lg border border-hairline bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-ink">{label}</p>
            <p className={['ledger-mono text-sm', over ? 'font-semibold text-signal' : 'text-ink'].join(' ')}>
              {formatAud(spentCents)}
              <span className="text-ink-muted"> / {formatAud(allocatedCents)}</span>
            </p>
          </div>
          {blurb && !expanded && <p className="mt-0.5 truncate text-xs text-ink-muted">{blurb}</p>}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-deep">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${Math.max(pct > 0 ? 4 : 0, pct)}%`, background: over ? 'var(--signal)' : color }}
            />
          </div>
          {pace != null && allocatedCents > 0 && (
            <p className={['mt-1 text-[11px]', pace < 0 ? 'font-medium text-signal' : 'text-ink-muted'].join(' ')}>
              {pace === 0 ? 'On pace' : pace > 0 ? `${pace}d ahead of pace` : `${Math.abs(pace)}d behind pace`}
            </p>
          )}
        </div>

        <svg
          className={['h-4 w-4 shrink-0 text-ink-muted transition-transform duration-150', expanded ? 'rotate-180' : ''].join(' ')}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path d="M5.25 7.5 10 12.25 14.75 7.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <ul className="space-y-2 border-t border-hairline p-4 pt-3">
          {lines.map((line) => (
            <MicroCategoryRow
              key={line.id}
              line={line}
              onChange={(cents) => onChangeLine(line.id, cents)}
              onSave={(cents) => onSaveLine(line.id, cents)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function MicroCategoryRow({
  line,
  onChange,
  onSave,
}: {
  line: MicroCategoryLine
  onChange: (cents: number) => void
  onSave: (cents: number) => void
}) {
  const [text, setText] = useState((line.allocatedCents / 100).toFixed(2))
  const over = line.allocatedCents > 0 && line.spentCents > line.allocatedCents

  return (
    <li className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: line.color }} aria-hidden />
        <span className="truncate text-sm text-ink">{line.name}</span>
        <span className={['ledger-mono shrink-0 text-xs', over ? 'text-signal' : 'text-ink-muted'].join(' ')}>
          {formatAud(line.spentCents)} spent
        </span>
      </div>
      <label className="flex shrink-0 items-center gap-1 text-sm">
        <span className="text-ink-muted">$</span>
        <input
          className="field ledger-mono w-20 text-right"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const parsed = parseDollarsToCents(e.target.value)
            if (parsed != null) onChange(parsed)
          }}
          onBlur={() => {
            const parsed = parseDollarsToCents(text) ?? 0
            setText((parsed / 100).toFixed(2))
            onChange(parsed)
            onSave(parsed)
          }}
        />
      </label>
    </li>
  )
}
