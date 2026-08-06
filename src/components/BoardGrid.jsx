import { useEffect, useRef, useState } from 'react'
import { colorForRank, valueOf } from '../lib/ranks'
import { gridWidthRem } from '../lib/board'

const STATE_STYLE = {
  open: 'bg-violet-50 border-2 border-dashed border-violet-200',
  blocked: 'bg-indigo-950 border border-indigo-900 shadow-inner',
  semi: 'bg-amber-400 border border-amber-500 shadow-sm',
}

// Once a tile holds a placed item, its background becomes the rank color —
// these borders keep the underlying blocked/semi state visible on top of it.
// White reads reliably against every color in the rank ramp, so the state
// is distinguished by border style (solid vs dashed) rather than color.
const FILLED_BORDER_STYLE = {
  blocked: 'border-[3px] border-solid border-white/90',
  semi: 'border-[3px] border-dashed border-white/90',
}

const BRUSH_STYLE = {
  open: 'border-violet-300 bg-violet-50 text-violet-700',
  semi: 'border-amber-400 bg-amber-50 text-amber-700',
  blocked: 'border-indigo-400 bg-indigo-50 text-indigo-700',
}

const STATES = [
  { state: 'open', label: 'Open' },
  { state: 'semi', label: 'Semi-blocked' },
  { state: 'blocked', label: 'Blocked' },
]

export default function BoardGrid({ tiles, placements, onPaint, onFillAll }) {
  const [brush, setBrush] = useState('blocked')
  // A ref, not state: mousedown/mouseenter/mouseup fire faster than React
  // can re-render, so a state-backed flag can be stale by the time the next
  // tile's mouseenter checks it, letting the drag leak onto that tile.
  const paintingRef = useRef(false)

  useEffect(() => {
    const stop = () => {
      paintingRef.current = false
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  const placementByCell = new Map()
  for (const p of placements ?? []) {
    placementByCell.set(`${p.row},${p.col}`, p.rank)
  }

  function paint(r, c) {
    if (tiles[r][c] !== brush) onPaint(r, c, brush)
  }

  const cols = tiles[0]?.length ?? 0
  // Toolbar/legend text is long enough to not wrap on its own on a wide
  // screen — without a cap, the card stretches to match that text instead of
  // the actual tile grid. Cap it to the grid's own width so those rows wrap
  // instead.
  const widthRem = gridWidthRem(cols)

  return (
    <div className="flex flex-col gap-3" style={{ maxWidth: `${widthRem}rem` }}>
      {onPaint && (
        <div className="flex items-center gap-3 flex-wrap justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-500 mr-1">Brush</span>
            {STATES.map(({ state, label }) => (
              <button
                key={state}
                type="button"
                onClick={() => setBrush(state)}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                  brush === state ? BRUSH_STYLE[state] : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <span className={`w-3 h-3 rounded-sm inline-block ${STATE_STYLE[state]}`} />
                {label}
              </button>
            ))}
          </div>

          {onFillAll && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-slate-500 mr-1">Fill all</span>
              <button
                type="button"
                onClick={() => onFillAll('open')}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300 transition-colors"
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => onFillAll('blocked')}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300 transition-colors"
              >
                Blocked
              </button>
            </div>
          )}
        </div>
      )}

      <div className="inline-block bg-slate-100 border border-slate-200 rounded-2xl p-4 select-none">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${tiles[0]?.length ?? 0}, minmax(0, 4.25rem))` }}
        >
          {tiles.map((row, r) =>
            row.map((state, c) => {
              const rank = placementByCell.get(`${r},${c}`)
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  onMouseDown={(e) => {
                    if (!onPaint) return
                    e.preventDefault()
                    paintingRef.current = true
                    paint(r, c)
                  }}
                  onMouseEnter={() => paintingRef.current && paint(r, c)}
                  onDragStart={(e) => e.preventDefault()}
                  title={rank ? `rank ${rank} (${valueOf(rank)} DR) · ${state}` : state}
                  className={`aspect-square rounded-lg text-white flex flex-col items-center justify-center leading-tight transition-all ${
                    rank ? FILLED_BORDER_STYLE[state] : STATE_STYLE[state]
                  } ${onPaint ? 'cursor-pointer hover:scale-[1.06] hover:shadow-lg hover:z-10' : ''}`}
                  style={rank ? { backgroundColor: colorForRank(rank) } : undefined}
                >
                  {rank && (
                    <>
                      <span className="text-base font-bold">{rank}</span>
                      <span className="text-[10px] font-semibold opacity-85">{valueOf(rank)} DR</span>
                    </>
                  )}
                </button>
              )
            }),
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
        {STATES.map(({ state, label }) => (
          <span key={state} className="flex items-center gap-1.5">
            <span className={`w-3.5 h-3.5 rounded-sm inline-block ${STATE_STYLE[state]}`} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-sm inline-block bg-slate-400 border-[3px] border-solid border-white" />
          Filled + blocked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-sm inline-block bg-slate-400 border-[3px] border-dashed border-white" />
          Filled + semi
        </span>
        <span className="text-slate-400">· tile shows rank and its DR value</span>
        {onPaint && <span className="text-slate-400">· click or drag to paint the selected brush</span>}
      </div>
    </div>
  )
}
