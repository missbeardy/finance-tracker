import { useState } from 'react'
import { formatAud, parseDollarsToCents } from '@/lib/money'
import { paceDaysDelta } from '@/lib/budget/calc'
import { paceLabel } from '@/lib/budget/paceLabel'
import { categoryEmoji } from '@/lib/categoryEmoji'

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
  onDeleteLine,
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
  onDeleteLine: (line: MicroCategoryLine) => void
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
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span
          className="emoji-icon !h-9 !w-9 !text-[16px]"
          style={{ boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.35), 0 0 14px -4px ${color}` }}
          aria-hidden
        >
          {categoryEmoji(label)}
        </span>

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
              style={{
                width: `${Math.max(pct > 0 ? 4 : 0, pct)}%`,
                background: over ? 'var(--signal)' : color,
                boxShadow: over ? '0 0 10px var(--signal)' : `0 0 10px ${color}`,
              }}
            />
          </div>
          {pace != null && allocatedCents > 0 && (
            <p className={['mt-1 text-xs', pace < 0 ? 'font-medium text-signal' : 'text-ink-muted'].join(' ')}>
              {paceLabel(pace)}
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
        <ul className="divide-y divide-hairline border-t border-hairline px-4">
          {lines.map((line) => (
            <MicroCategoryRow
              key={line.id}
              line={line}
              onChange={(cents) => onChangeLine(line.id, cents)}
              onSave={(cents) => onSaveLine(line.id, cents)}
              onDelete={() => onDeleteLine(line)}
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
  onDelete,
}: {
  line: MicroCategoryLine
  onChange: (cents: number) => void
  onSave: (cents: number) => void
  onDelete: () => void
}) {
  const [text, setText] = useState((line.allocatedCents / 100).toFixed(2))
  const over = line.allocatedCents > 0 && line.spentCents > line.allocatedCents

  return (
    <li className="space-y-1.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: line.color }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{line.name}</span>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${line.name}`}
          className="shrink-0 rounded-md p-1 text-ink-muted transition-colors duration-120 hover:text-signal"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m2 0-.6 9.4a1.5 1.5 0 0 1-1.5 1.6H8.1a1.5 1.5 0 0 1-1.5-1.6L6 6" />
          </svg>
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 pl-3.5">
        <span className={['ledger-mono text-xs', over ? 'text-signal' : 'text-ink-muted'].join(' ')}>
          {formatAud(line.spentCents)} spent
        </span>
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
      </div>
    </li>
  )
}
