import { useEffect, useRef, useState } from 'react'
import { PlayCircle, RotateCcw, Lock } from 'lucide-react'
import Card from './ui/Card'
import Button from './ui/Button'
import MergeCelebration from './MergeCelebration'
import { colorForRank, valueOf, MAX_RANK } from '../lib/ranks'
import { gridWidthRem } from '../lib/board'
import { tierForRank, celebrationDuration } from '../lib/mergeCelebration'
import { createPlaySession, canSpendGenerator, spendGenerator, actionFor, moveItem, mergeItems, compareToSimulator } from '../lib/playSession'

// ring-offset punches a solid white gap between the tile and the ring, so
// the highlight stays visible regardless of the tile's own rank color
// (a plain ring-2 in the same hue family as a low rank's own fill color —
// e.g. the emerald merge ring on a rank-1 emerald tile — all but disappears
// without it).
const TARGET_STYLE = {
  move: 'ring-4 ring-offset-2 ring-offset-white ring-sky-400',
  merge: 'ring-4 ring-offset-2 ring-offset-white ring-emerald-400',
}

export default function PlayTester({ board }) {
  const [session, setSession] = useState(() => createPlaySession(board))
  const [selected, setSelected] = useState(null)
  const [compared, setCompared] = useState(null)
  const [celebration, setCelebration] = useState(null)
  const celebrationTimeout = useRef(null)
  const nextCelebrationKey = useRef(0)

  useEffect(() => () => clearTimeout(celebrationTimeout.current), [])

  const hasSubsidyTiles = board.tiles.some((row) => row.some((s) => s === 'blocked' || s === 'semi'))
  const needsGeneration = hasSubsidyTiles && board.semiPlacements.length === 0 && board.blockedQueue.length === 0

  function reset() {
    setSession(createPlaySession(board))
    setSelected(null)
    setCompared(null)
    clearTimeout(celebrationTimeout.current)
    setCelebration(null)
  }

  // Bigger merges get a bigger burst (see MergeCelebration's tiers) - purely
  // cosmetic feedback, keyed uniquely per trigger so two merges landing on
  // the same cell in a row each get their own fresh animation instead of
  // React bailing out on an "unchanged" celebration prop.
  function celebrateMerge(cell, newRank) {
    const tier = tierForRank(newRank)
    clearTimeout(celebrationTimeout.current)
    setCelebration({ key: nextCelebrationKey.current++, row: cell[0], col: cell[1], tier })
    celebrationTimeout.current = setTimeout(() => setCelebration(null), celebrationDuration(tier))
  }

  // playSession's actions mutate the session object they're given (see its
  // own comments) - that's fine for a single direct call, but passing a
  // function with that same mutation into setSession is not: React (Strict
  // Mode in particular) can invoke a state updater function more than once
  // per call to detect exactly this kind of impurity, which would silently
  // perform the mutation twice. Mutating once here, synchronously, and only
  // ever handing setSession an already-computed plain object sidesteps that
  // - a repeated set to an equivalent object is harmless.
  function handleSpend() {
    spendGenerator(session)
    setSession({ ...session })
  }

  function applyAction(kind, from, to) {
    if (kind === 'move') {
      moveItem(session, from, to)
    } else if (kind === 'merge') {
      const before = session.events.length
      mergeItems(session, from, to)
      const mergeEvent = session.events.slice(before).find((e) => e.type === 'merge')
      if (mergeEvent) celebrateMerge(mergeEvent.into, mergeEvent.newRank)
    } else {
      return
    }
    setSession({ ...session })
  }

  function handleCellClick(r, c) {
    const { state } = session
    if (selected) {
      const kind = actionFor(session, selected, [r, c])
      if (kind) {
        applyAction(kind, selected, [r, c])
        setSelected(null)
        return
      }
      // Clicking an invalid target, or the same cell again, just clears the
      // selection - re-select below if the new cell is itself movable.
      setSelected(null)
      if (state.itemAt[r][c] != null && !state.stuck[r][c]) setSelected([r, c])
      return
    }

    if (state.itemAt[r][c] != null && !state.stuck[r][c]) setSelected([r, c])
  }

  // Native HTML5 drag-and-drop for moving/merging - the drag source is
  // carried in dataTransfer (authoritative for the drop itself, immune to
  // any state-update timing), while `selected` mirrors it purely to drive
  // the same target-highlighting used for click-to-select.
  function handleDragStart(e, r, c) {
    const { state } = session
    if (state.itemAt[r][c] == null || state.stuck[r][c]) return
    e.dataTransfer.setData('text/plain', `${r},${c}`)
    e.dataTransfer.effectAllowed = 'move'
    setSelected([r, c])
  }

  function handleDragOver(e) {
    e.preventDefault()
  }

  function handleDrop(e, r, c) {
    e.preventDefault()
    const data = e.dataTransfer.getData('text/plain')
    setSelected(null)
    if (!data) return
    const [fr, fc] = data.split(',').map(Number)
    applyAction(actionFor(session, [fr, fc], [r, c]), [fr, fc], [r, c])
  }

  const maxRankReached = Object.keys(session.reachedAt).length
    ? Math.max(...Object.keys(session.reachedAt).map(Number))
    : 0

  const cols = board.cols
  const widthRem = gridWidthRem(cols)

  return (
    <Card
      title="Play tester"
      subtitle="Manually play this board with the same rules the simulator uses — a ground-truth check on whether the automatic simulation actually matches how the game should feel"
      action={
        <Button variant="secondary" size="sm" icon={RotateCcw} onClick={reset}>
          Reset
        </Button>
      }
    >
      {needsGeneration ? (
        <p className="text-xs text-amber-600">
          This board has blocked/semi tiles with no generated items yet — generate items in the editor first.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex flex-col gap-3" style={{ maxWidth: `${widthRem}rem` }}>
              <div className="inline-block bg-slate-100 border border-slate-200 rounded-2xl p-4 select-none">
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 4.25rem))` }}>
                  {session.state.itemAt.map((row, r) =>
                    row.map((rank, c) => {
                      const state = session.state
                      const locked = state.locked[r][c]
                      const stuck = state.stuck[r][c]
                      const movable = rank != null && !stuck
                      const isSelected = selected && selected[0] === r && selected[1] === c
                      const targetKind = selected ? actionFor(session, selected, [r, c]) : null

                      // Free items (including a semi/blocked item that's
                      // already been cleared) get a clean, plain fill.
                      // Still-stuck items get a dashed dark border plus a
                      // lock badge, so "merge into this one, but it can't
                      // move yet" reads at a glance — the badge tracks the
                      // item's CURRENT clear state, not its original tile
                      // type, since a cleared item is fully free from then
                      // on (see mergeSimulation.js's stuck comment).
                      let tileClass = 'bg-violet-50 border-2 border-dashed border-violet-200'
                      if (locked) tileClass = 'bg-indigo-950 border border-indigo-900 shadow-inner'
                      else if (rank != null && stuck) tileClass = 'border-[3px] border-dashed border-slate-900/60'
                      else if (rank != null) tileClass = 'border border-white/50'

                      return (
                        <button
                          key={`${r}-${c}`}
                          type="button"
                          draggable={movable}
                          onDragStart={(e) => handleDragStart(e, r, c)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, r, c)}
                          onDragEnd={() => setSelected(null)}
                          onClick={() => handleCellClick(r, c)}
                          title={rank ? `rank ${rank} (${valueOf(rank)} DR)${stuck ? ' · stuck, merge-into only until cleared' : ''}` : locked ? 'locked' : 'open'}
                          className={`relative aspect-square rounded-lg text-white flex flex-col items-center justify-center leading-tight transition-colors ${
                            movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                          } ${tileClass} ${
                            isSelected ? 'ring-4 ring-offset-2 ring-offset-white ring-purple-500' : ''
                          } ${targetKind ? TARGET_STYLE[targetKind] : ''}`}
                          style={rank != null ? { backgroundColor: colorForRank(rank) } : undefined}
                        >
                          {stuck && rank != null && <Lock size={11} className="absolute top-1 left-1 text-white/80" />}
                          {rank != null && (
                            <>
                              <span className="text-base font-bold">{rank}</span>
                              <span className="text-[10px] font-semibold opacity-85">{valueOf(rank)} DR</span>
                            </>
                          )}
                          {celebration && celebration.row === r && celebration.col === c && (
                            <MergeCelebration key={celebration.key} tier={celebration.tier} />
                          )}
                        </button>
                      )
                    }),
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Lock size={11} className="text-slate-500" />
                  Stuck — merge-into only until cleared, then fully free
                </span>
                <span className="text-slate-400">· drag (or click, then click a target) to move or merge a free item</span>
              </div>
            </div>

            <div className="flex flex-col gap-4 flex-1 min-w-64">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">DR spent</span>
                  <span className="font-semibold text-slate-800 tabular-nums">{session.drSpent}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Highest rank reached</span>
                  <span className="font-semibold text-slate-800 tabular-nums">{maxRankReached || '—'}</span>
                </div>
              </div>

              <Button variant="primary" icon={PlayCircle} onClick={handleSpend} disabled={!canSpendGenerator(session)}>
                Spend generator (1 DR → rank 1)
              </Button>

              <Button variant="secondary" onClick={() => setCompared(compareToSimulator(session))}>
                Compare to automatic simulator at {session.drSpent} DR
              </Button>
              {compared && (
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col gap-1">
                  <span className="font-medium text-slate-700">Simulator's reachedAt at this DR spend:</span>
                  {Object.keys(compared.reachedAt).length === 0 ? (
                    <span className="text-slate-400">nothing reached yet</span>
                  ) : (
                    Object.entries(compared.reachedAt)
                      .sort((a, b) => Number(a[0]) - Number(b[0]))
                      .map(([rank, dr]) => (
                        <span key={rank}>
                          rank {rank} at {dr} DR{session.reachedAt[rank] !== undefined ? ` (you: ${session.reachedAt[rank]} DR)` : ' (you: not yet)'}
                        </span>
                      ))
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1 text-xs text-slate-500 max-h-72 overflow-y-auto border border-slate-100 rounded-lg p-2">
                {session.events
                  .slice()
                  .reverse()
                  .map((e, i) => <EventLine key={i} event={e} />)}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function EventLine({ event }) {
  const dr = `[${event.drSpent} DR]`
  if (event.type === 'initial') return <span>{dr} starts with rank {event.rank} at {fmt(event.cell)}</span>
  if (event.type === 'spend') return <span>{dr} spent {event.tier} DR → rank {event.rank} at {fmt(event.cell)}</span>
  if (event.type === 'moved') return <span>{dr} moved {fmt(event.from)} → {fmt(event.to)}</span>
  if (event.type === 'merge') return <span>{dr} merged rank {event.rank} → rank {event.newRank} at {fmt(event.into)}</span>
  if (event.type === 'reveal') return <span>{dr} revealed rank {event.rank} at {fmt(event.cell)}</span>
  if (event.type === 'reached')
    return (
      <span className={event.rank === MAX_RANK ? 'font-semibold text-amber-600' : 'font-medium text-slate-700'}>
        {dr} *** reached rank {event.rank} ***
      </span>
    )
  return null
}

function fmt(cell) {
  return `(${cell[0]},${cell[1]})`
}
