import { useEffect, useRef, useState } from 'react'
import { PlayCircle, RotateCcw, Lock, Gamepad2, Zap, Trophy, CheckCircle2, Package, ArrowDownToLine } from 'lucide-react'
import Card from './ui/Card'
import Button from './ui/Button'
import MergeCelebration from './MergeCelebration'
import { colorForRank, valueOf, MAX_RANK } from '../lib/ranks'
import { gridWidthRem } from '../lib/board'
import { tierForRank, celebrationDuration } from '../lib/mergeCelebration'
import { GENERATOR_TIERS } from '../lib/generatorTier'
import {
  createPlaySession,
  canSpendGenerator,
  spendGenerator,
  unlockedGeneratorTiers,
  actionFor,
  moveItem,
  mergeItems,
  placeFromInventory,
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

export default function PlayTester({ boards, boardIndex }) {
  const board = boards[boardIndex]
  const [session, setSession] = useState(() => createPlaySession(boards, boardIndex))
  const [selected, setSelected] = useState(null)
  const [selectedInventoryIndex, setSelectedInventoryIndex] = useState(null)
  const [compared, setCompared] = useState(null)
  const [celebration, setCelebration] = useState(null)
  const [chosenTierCost, setChosenTierCost] = useState(1)
  const celebrationTimeout = useRef(null)
  const nextCelebrationKey = useRef(0)

  useEffect(() => () => clearTimeout(celebrationTimeout.current), [])

  const hasSubsidyTiles = board.tiles.some((row) => row.some((s) => s === 'blocked' || s === 'semi'))
  const needsGeneration = hasSubsidyTiles && board.semiPlacements.length === 0 && board.blockedQueue.length === 0

  function reset() {
    setSession(createPlaySession(boards, boardIndex))
    setSelected(null)
    setSelectedInventoryIndex(null)
    setCompared(null)
    setChosenTierCost(1)
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
    spendGenerator(session, activeTier)
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
    if (selectedInventoryIndex != null) {
      if (state.itemAt[r][c] == null && !state.locked[r][c]) {
        placeFromInventory(session, selectedInventoryIndex, [r, c])
        setSession({ ...session })
      }
      setSelectedInventoryIndex(null)
      return
    }

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

  // Selecting an inventory chip is mutually exclusive with selecting a board
  // cell - clicking one clears the other, same as re-selecting a different
  // board cell already clears the previous selection.
  function handleInventoryClick(i) {
    setSelected(null)
    setSelectedInventoryIndex((current) => (current === i ? null : i))
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
    // Grab the drag image from the tile synchronously, before anything else
    // touches it. Without this, the browser takes its default snapshot on a
    // later tick, and the setSelected below (which restyles this exact node
    // with a highlight ring) sometimes lands before that snapshot - the
    // result is the intermittent broken/blank drag ghost.
    e.dataTransfer.setDragImage(e.currentTarget, e.currentTarget.offsetWidth / 2, e.currentTarget.offsetHeight / 2)
    requestAnimationFrame(() => setSelected([r, c]))
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
  // The player can choose any currently-unlocked tier, not just the
  // highest - if their choice re-locks (e.g. they merge away their only
  // rank-7 item), fall back to the highest tier still unlocked.
  const unlockedTiers = unlockedGeneratorTiers(session)
  const activeTier = unlockedTiers.find((t) => t.cost === chosenTierCost) ?? unlockedTiers[unlockedTiers.length - 1]

  const nextBoard = session.nextBoardIndex < session.boards.length ? session.boards[session.nextBoardIndex] : null

  const cols = board.cols
  const widthRem = gridWidthRem(cols)

  return (
    <Card
      title="Play tester"
      subtitle="Manually play this board with the same rules the simulator uses — a ground-truth check on whether the automatic simulation actually matches how the game should feel"
      icon={Gamepad2}
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
              <div className="inline-block bg-gradient-to-br from-indigo-50 via-violet-50 to-fuchsia-50 border border-violet-100 rounded-3xl p-4 shadow-inner select-none">
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 4.25rem))` }}>
                  {session.state.itemAt.map((row, r) =>
                    row.map((rank, c) => {
                      const state = session.state
                      const locked = state.locked[r][c]
                      const stuck = state.stuck[r][c]
                      const movable = rank != null && !stuck
                      const isSelected = selected && selected[0] === r && selected[1] === c
                      const targetKind =
                        selectedInventoryIndex != null
                          ? rank == null && !locked
                            ? 'move'
                            : null
                          : selected
                            ? actionFor(session, selected, [r, c])
                            : null

                      // Free items (including a semi/blocked item that's
                      // already been cleared) get a clean, plain fill.
                      // Still-stuck items get a dashed dark border plus a
                      // lock badge, so "merge into this one, but it can't
                      // move yet" reads at a glance — the badge tracks the
                      // item's CURRENT clear state, not its original tile
                      // type, since a cleared item is fully free from then
                      // on (see mergeSimulation.js's stuck comment).
                      let tileClass = 'bg-violet-50 border-2 border-dashed border-violet-200'
                      if (locked) tileClass = 'bg-gradient-to-br from-indigo-900 to-slate-950 border border-indigo-900 shadow-inner'
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
                          className={`relative aspect-square rounded-xl text-white flex flex-col items-center justify-center leading-tight transition-colors shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] ${
                            movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                          } ${tileClass} ${
                            isSelected ? 'ring-4 ring-offset-2 ring-offset-white ring-purple-500' : ''
                          } ${targetKind ? TARGET_STYLE[targetKind] : ''}`}
                          style={rank != null ? { backgroundColor: colorForRank(rank) } : undefined}
                        >
                          {stuck && rank != null && <Lock size={11} className="absolute top-1 left-1 text-white/80" />}
                          {rank != null && (
                            <>
                              <span className="font-display text-base font-bold drop-shadow-sm">{rank}</span>
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

              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <ArrowDownToLine size={12} className="text-slate-400 shrink-0" />
                {nextBoard ? (
                  <span>
                    Next wave: <span className="font-medium text-slate-700">{nextBoard.name}</span> pushes in (
                    {Math.min(nextBoard.rows, 3)} row{Math.min(nextBoard.rows, 3) === 1 ? '' : 's'}) once this board's
                    blocked/semi tiles fully clear.
                  </span>
                ) : (
                  <span>No more boards queued — this board won't get any new waves.</span>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-1">
                  <Package size={12} strokeWidth={2.5} /> Inventory
                </span>
                {session.inventory.length === 0 ? (
                  <p className="text-xs text-slate-400 px-1">
                    Empty — items pushed off the bottom when a new board comes in land here, ready to place back on
                    a free cell.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {session.inventory.map((rank, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleInventoryClick(i)}
                        title={`rank ${rank} (${valueOf(rank)} DR) — click, then click a free cell to place it`}
                        className={`w-9 h-9 rounded-lg flex flex-col items-center justify-center text-white text-xs font-bold leading-none shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] transition-transform ${
                          selectedInventoryIndex === i ? 'ring-4 ring-offset-2 ring-offset-white ring-purple-500' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: colorForRank(rank) }}
                      >
                        {rank}
                        <span className="text-[8px] font-semibold opacity-85">{valueOf(rank)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4 flex-1 min-w-64">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-3">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    <Zap size={12} strokeWidth={2.5} /> DR spent
                  </span>
                  <span className="font-display text-2xl font-bold tabular-nums text-amber-700">{session.drSpent}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-fuchsia-50 p-3">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-purple-700">
                    <Trophy size={12} strokeWidth={2.5} /> Highest rank
                  </span>
                  <span className="font-display text-2xl font-bold tabular-nums text-purple-700">{maxRankReached || '—'}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-1">
                  <Zap size={12} strokeWidth={2.5} /> Generator tiers
                </span>
                {GENERATOR_TIERS.map((t) => {
                  const unlocked = unlockedTiers.some((u) => u.cost === t.cost)
                  const chosen = activeTier.cost === t.cost
                  return (
                    <button
                      key={t.cost}
                      type="button"
                      disabled={!unlocked}
                      onClick={() => setChosenTierCost(t.cost)}
                      title={unlocked ? `Use the x${t.cost} generator` : `Unlocks once you hold a rank-${t.unlocksAt} item`}
                      className={`flex items-center justify-between text-xs rounded-lg px-2 py-1.5 text-left transition-colors ${
                        chosen
                          ? 'bg-gradient-to-r from-purple-100 to-fuchsia-100 text-purple-800 font-semibold ring-1 ring-purple-300'
                          : unlocked
                            ? 'text-slate-600 hover:bg-slate-100 cursor-pointer'
                            : 'text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {chosen ? (
                          <CheckCircle2 size={13} className="text-purple-600 shrink-0" />
                        ) : unlocked ? (
                          <span className="w-3.5 shrink-0" />
                        ) : (
                          <Lock size={11} className="shrink-0" />
                        )}
                        x{t.cost} · {t.cost} DR → rank {t.normalRank}
                      </span>
                      <span className={chosen ? 'text-purple-600' : 'text-slate-400'}>
                        {chosen ? 'selected' : unlocked ? 'tap to use' : `unlocks at rank ${t.unlocksAt}`}
                      </span>
                    </button>
                  )
                })}
              </div>

              <Button variant="primary" icon={PlayCircle} onClick={handleSpend} disabled={!canSpendGenerator(session)}>
                Spend generator ({activeTier.cost} DR → rank {activeTier.normalRank})
              </Button>

              <Button variant="secondary" onClick={() => setCompared(compareToSimulator(session))}>
                Compare to automatic simulator at {session.drSpent} DR
              </Button>
              {compared && (
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
                  <span className="font-semibold text-slate-700">Simulator's reachedAt at this DR spend:</span>
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

              <div className="flex flex-col gap-1 text-[11px] font-mono text-slate-500 max-h-72 overflow-y-auto bg-slate-50/70 border border-slate-100 rounded-xl p-2.5">
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
  if (event.type === 'inventory-place') return <span>{dr} placed rank {event.rank} from inventory at {fmt(event.cell)}</span>
  if (event.type === 'board-push')
    return (
      <span className="font-medium text-slate-700">
        {dr} {event.name} pushed in ({event.rows} row{event.rows === 1 ? '' : 's'})
        {event.overflow.length > 0 && ` — ${event.overflow.length} item${event.overflow.length === 1 ? '' : 's'} sent to inventory`}
      </span>
    )
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
