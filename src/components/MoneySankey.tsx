import { useEffect, useMemo, useState } from 'react'
import { sankey, sankeyLinkHorizontal, type SankeyGraph } from 'd3-sankey'
import type { SankeyLink } from '@/hooks/useDashboardData'
import { formatAud } from '@/lib/money'

type NodeExtra = { id: string; label: string; kind: 'income' | 'account' | 'spend' | 'transfer' }
type LinkExtra = { kind: SankeyLink['kind'] }

type N = NodeExtra
type L = LinkExtra

const COLORS = {
  income: '#1F9D7A',
  account: '#6B3FE8',
  spend: '#C43D78',
  transfer: '#8A819C',
}

export function MoneySankey({
  links,
  onCategoryClick,
}: {
  links: SankeyLink[]
  onCategoryClick?: (categoryLabel: string) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [drawn, setDrawn] = useState(false)
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduceMotion) {
      setDrawn(true)
      return
    }
    setDrawn(false)
    const t = window.setTimeout(() => setDrawn(true), 40)
    return () => window.clearTimeout(t)
  }, [links, reduceMotion])

  const graph = useMemo(() => {
    if (!links.length) return null

    const nodeIds = new Set<string>()
    for (const l of links) {
      nodeIds.add(l.source)
      nodeIds.add(l.target)
    }

    const nodes: N[] = [...nodeIds].map((id) => {
      let kind: N['kind'] = 'account'
      let label = id
      if (id.startsWith('in:')) {
        kind = 'income'
        label = id.slice(3)
      } else if (id.startsWith('out:')) {
        kind = 'spend'
        label = id.slice(4)
      } else if (id === 'Internal transfers') {
        kind = 'transfer'
      }
      return { id, label, kind }
    })

    const indexedLinks: (L & { source: string; target: string; value: number })[] = links.map(
      (l) => ({
        source: l.source,
        target: l.target,
        value: l.value / 100, // dollars for layout readability
        kind: l.kind,
      }),
    )

    const layout = sankey<N, L>()
      .nodeId((d) => d.id)
      .nodeWidth(12)
      .nodePadding(16)
      .extent([
        [8, 8],
        [640 - 8, 280 - 8],
      ])

    return layout({
      nodes: nodes.map((n) => ({ ...n })),
      links: indexedLinks.map((l) => ({ ...l })),
    }) as SankeyGraph<N, L>
  }, [links])

  if (!graph) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg bg-surface text-sm text-ink-muted">
        Import transactions to see where money flows.
      </div>
    )
  }

  const path = sankeyLinkHorizontal<N, L>()

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox="0 0 640 280"
        className="h-auto w-full min-w-[320px]"
        role="img"
        aria-label="Money flow diagram"
      >
        {graph.links.map((link, i) => {
          const key = `${String((link.source as N).id)}-${String((link.target as N).id)}`
          const active = !hovered || hovered === key
          const delay = reduceMotion ? 0 : i * 40
          return (
            <path
              key={key}
              d={path(link) ?? undefined}
              fill="none"
              stroke={COLORS[link.kind]}
              strokeOpacity={active ? 0.45 : 0.08}
              strokeWidth={Math.max(2, link.width ?? 2)}
              style={{
                transition: 'stroke-opacity 120ms ease',
                strokeDasharray: reduceMotion ? undefined : 1200,
                strokeDashoffset: drawn ? 0 : 1200,
                transitionProperty: 'stroke-opacity, stroke-dashoffset',
                transitionDuration: drawn || reduceMotion ? '120ms, 600ms' : '120ms, 0ms',
                transitionDelay: drawn ? `0ms, ${delay}ms` : '0ms, 0ms',
              }}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>
                {(link.source as N).label} → {(link.target as N).label}:{' '}
                {formatAud(Math.round(link.value * 100))}
              </title>
            </path>
          )
        })}
        {graph.nodes.map((node) => {
          const x = node.x0 ?? 0
          const y = node.y0 ?? 0
          const h = Math.max(4, (node.y1 ?? 0) - (node.y0 ?? 0))
          const w = (node.x1 ?? 0) - (node.x0 ?? 0)
          const clickable = node.kind === 'spend'
          return (
            <g key={node.id}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={COLORS[node.kind]}
                rx={2}
                className={clickable ? 'cursor-pointer' : undefined}
                onClick={() => {
                  if (clickable) onCategoryClick?.(node.label)
                }}
              />
              <text
                x={node.kind === 'income' ? x + w + 6 : x - 6}
                y={y + h / 2}
                textAnchor={node.kind === 'income' ? 'start' : 'end'}
                dominantBaseline="middle"
                className="fill-[var(--ink)]"
                style={{ fontSize: 10, fontFamily: 'Inter Tight, sans-serif' }}
              >
                {node.label}
              </text>
            </g>
          )
        })}
      </svg>
      {hovered && (
        <p className="px-2 pb-2 text-xs text-ink-muted">
          Hover a ribbon for the amount. Tap a category on the right to open the ledger.
        </p>
      )}
    </div>
  )
}
