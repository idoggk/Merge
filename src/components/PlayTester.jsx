import { useState } from 'react'
import { PlayCircle, RotateCcw, Sparkles, Star } from 'lucide-react'
import Card from './ui/Card'
import Button from './ui/Button'
import { colorForRank, valueOf, MAX_RANK } from '../lib/ranks'
import { gridWidthRem } from '../lib/board'
import {
  createPlaySession,
  generatorInfo,
  canSpendGenerator,
  spendGenerator,
  canPlaceSpawn,
  placeSpawn,
  actionFor,
  moveItem,
  mergeItems,
  activeAnchorCell,
  compareToSimulator,
} from '../lib/playSession'

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

  const hasSubsidyTiles = board.tiles.some((row) => row.some((s) => s === 'blocked' || s === 'semi'))
  const needsGeneration = hasSubsidyTiles && board.semiPlacements.length === 0 && board.blockedQueue.length === 0

  function reset() {
    setSession(createPlaySession(board))
    setSelected(null)
    setCompared(null)
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

  function handleCellClick(r, c) {
    const { state, pendingSpawn } = session
    if (pendingSpawn) {
      if (canPlaceSpawn(session, r, c)) {
        placeSpawn(session, r, c)
        setSession({ ...session })
      }
      return
    }

    if (selected) {
      const kind = actionFor(session, selected, [r, c])
      if (kind === 'move') {
        moveItem(session, selected, [r, c])
        setSession({ ...session })
        setSelected(null)
        return
      }
      if (kind === 'merge') {
        mergeItems(session, selected, [r, c])
        setSession({ ...session })
        setSelected(null)
        return
      }
      // Clicking an invalid target, or the same cell again, just clears the
      // selection - re-select below if the new cell is itself movable.
      setSelected(null)
      if (state.itemAt[r][c] != null && !state.subsidyOrigin[r][c]) setSelected([r, c])
      return
    }

    if (state.itemAt[r][c] != null && !state.subsidyOrigin[r][c]) setSelected([r, c])
  }

  const genInfo = generatorInfo(session)
  const anchorCell = activeAnchorCell(session)
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
                      const subsidy = state.subsidyOrigin[r][c]
                      const isSelected = selected && selected[0] === r && selected[1] === c
                      const targetKind = selected ? actionFor(session, selected, [r, c]) : null
                      const isAnchor = anchorCell && anchorCell[0] === r && anchorCell[1] === c
                      const placeable = session.pendingSpawn && canPlaceSpawn(session, r, c)

                      let tileClass = 'bg-violet-50 border-2 border-dashed border-violet-200'
                      if (locked) tileClass = 'bg-indigo-950 border border-indigo-900 shadow-inner'
                      else if (rank != null && subsidy) tileClass = 'border-[3px] border-solid border-white/90'
                      else if (rank != null) tileClass = 'border border-slate-300'

                      return (
                        <button
                          key={`${r}-${c}`}
                          type="button"
                          onClick={() => handleCellClick(r, c)}
                          title={rank ? `rank ${rank} (${valueOf(rank)} DR)${subsidy ? ' · fixed, merge-into only' : ''}` : locked ? 'locked' : 'open'}
                          className={`relative aspect-square rounded-lg text-white flex flex-col items-center justify-center leading-tight transition-all cursor-pointer hover:scale-[1.05] hover:z-10 ${tileClass} ${
                            isSelected ? 'ring-4 ring-offset-2 ring-offset-white ring-purple-500' : ''
                          } ${targetKind ? TARGET_STYLE[targetKind] : ''} ${placeable ? 'ring-4 ring-offset-2 ring-offset-white ring-amber-400' : ''}`}
                          style={rank != null ? { backgroundColor: colorForRank(rank) } : undefined}
                        >
                          {isAnchor && (
                            <Star size={12} className="absolute top-1 right-1 fill-amber-300 text-amber-300" />
                          )}
                          {rank != null && (
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
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-sm inline-block border-[3px] border-solid border-white bg-slate-400" />
                  Fixed (blocked/semi) — merge-into only, never moves
                </span>
                <span className="flex items-center gap-1.5">
                  <Star size={12} className="fill-amber-400 text-amber-400" />
                  Active anchor — the one subsidy cell currently eligible
                </span>
                <span className="text-slate-400">
                  · click a movable item, then click a target to move or merge it
                </span>
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

              <Button
                variant="primary"
                icon={session.pendingSpawn ? Sparkles : PlayCircle}
                onClick={handleSpend}
                disabled={!canSpendGenerator(session)}
              >
                {session.pendingSpawn
                  ? `Place the rank ${session.pendingSpawn.rank} item`
                  : `Spend generator (${genInfo.cost} DR → rank ${genInfo.normalRank}${genInfo.luckyDropsActive ? ', lucky drops live' : ''})`}
              </Button>
              {session.pendingSpawn && (
                <p className="text-xs text-amber-600">Click an empty, unlocked cell to place it.</p>
              )}

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
  if (event.type === 'spend') return <span>{dr} spent {event.tier} DR → rank {event.rank}</span>
  if (event.type === 'placed') return <span>{dr} placed rank {event.rank} at {fmt(event.cell)}</span>
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
