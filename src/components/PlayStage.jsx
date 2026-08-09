import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Lock, Zap, Trophy, Package, ArrowDownToLine, PartyPopper } from 'lucide-react'
import Button from './ui/Button'
import MergeCelebration from './MergeCelebration'
import LuckyDropCelebration from './LuckyDropCelebration'
import RanksBar from './RanksBar'
import { colorForRank, MAX_RANK } from '../lib/ranks'
import { gridWidthRem } from '../lib/board'
import { tierForRank, tierForBonus, celebrationDuration } from '../lib/mergeCelebration'
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
} from '../lib/playSession'

const TARGET_STYLE = {
  move: 'ring-4 ring-offset-2 ring-offset-white ring-sky-400',
  merge: 'ring-4 ring-offset-2 ring-offset-white ring-emerald-400',
}

// The player-facing counterpart to PlayTester - same session engine
// (playSession.js), same board-chaining/lucky-drop/tier mechanics, but with
// every economist-only tool stripped out (no compare-to-simulator, no raw
// event log) and a bit more game dressing (a completion banner at
// MAX_RANK). Always starts at boards[0] - a shared stage is the whole
// sequence, not a single board a player picks.
export default function PlayStage({ boards, stageName }) {
  const [session, setSession] = useState(() => createPlaySession(boards, 0))
  const [selected, setSelected] = useState(null)
  const [celebration, setCelebration] = useState(null)
  const [luckyCelebration, setLuckyCelebration] = useState(null)
  const [chosenTierCost, setChosenTierCost] = useState(1)
  const celebrationTimeout = useRef(null)
  const nextCelebrationKey = useRef(0)
  const luckyCelebrationTimeout = useRef(null)
  const nextLuckyCelebrationKey = useRef(0)
  const prevHighestUnlockedCost = useRef(1)

  useEffect(() => () => clearTimeout(celebrationTimeout.current), [])
  useEffect(() => () => clearTimeout(luckyCelebrationTimeout.current), [])

  function reset() {
    setSession(createPlaySession(boards, 0))
    setSelected(null)
    setChosenTierCost(1)
    prevHighestUnlockedCost.current = 1
    clearTimeout(celebrationTimeout.current)
    setCelebration(null)
    clearTimeout(luckyCelebrationTimeout.current)
    setLuckyCelebration(null)
  }

  function celebrateMerge(cell, newRank) {
    const tier = tierForRank(newRank)
    clearTimeout(celebrationTimeout.current)
    setCelebration({ key: nextCelebrationKey.current++, row: cell[0], col: cell[1], tier })
    celebrationTimeout.current = setTimeout(() => setCelebration(null), celebrationDuration(tier))
  }

  function celebrateLuckyDrop(cell, bonus) {
    const tier = tierForBonus(bonus)
    clearTimeout(luckyCelebrationTimeout.current)
    setLuckyCelebration({ key: nextLuckyCelebrationKey.current++, row: cell[0], col: cell[1], tier, bonus })
    luckyCelebrationTimeout.current = setTimeout(() => setLuckyCelebration(null), celebrationDuration(tier))
  }

  // See PlayTester's identical comment - session mutations happen once here,
  // synchronously, never inside the setSession updater itself.
  function handleSpend() {
    const before = session.events.length
    spendGenerator(session, activeTier)
    const spendEvent = session.events.slice(before).find((e) => e.type === 'spend')
    if (spendEvent && spendEvent.bonus > 0) celebrateLuckyDrop(spendEvent.cell, spendEvent.bonus)
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
      setSelected(null)
      if (state.itemAt[r][c] != null && !state.stuck[r][c]) setSelected([r, c])
      return
    }
    if (state.itemAt[r][c] != null && !state.stuck[r][c]) setSelected([r, c])
  }

  function handleInventoryClick(i) {
    placeFromInventory(session, i)
    setSession({ ...session })
  }

  function handleDragStart(e, r, c) {
    const { state } = session
    if (state.itemAt[r][c] == null || state.stuck[r][c]) return
    e.dataTransfer.setData('text/plain', `${r},${c}`)
    e.dataTransfer.effectAllowed = 'move'
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
  const unlockedTiers = unlockedGeneratorTiers(session)
  const highestUnlockedCost = unlockedTiers[unlockedTiers.length - 1].cost
  const activeTier = unlockedTiers.find((t) => t.cost === chosenTierCost) ?? unlockedTiers[unlockedTiers.length - 1]

  useEffect(() => {
    if (highestUnlockedCost > prevHighestUnlockedCost.current) {
      setChosenTierCost(highestUnlockedCost)
    }
    prevHighestUnlockedCost.current = highestUnlockedCost
  }, [highestUnlockedCost])

  const board = session.boards[session.boardIndex]
  const nextBoard = session.nextBoardIndex < session.boards.length ? session.boards[session.nextBoardIndex] : null
  const finished = maxRankReached >= MAX_RANK

  const cols = board.cols
  const widthRem = gridWidthRem(cols)

  return (
    <div className="flex flex-col gap-5 play-compact-gap w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-slate-900 leading-tight tracking-tight truncate">{stageName ?? 'Merge Mania'}</h1>
          <p className="text-xs text-slate-400 play-hide-compact">Merge matching items, spend the generator, and climb the chain</p>
        </div>
        <Button variant="secondary" size="sm" icon={RotateCcw} onClick={reset}>
          Restart
        </Button>
      </div>

      {finished && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-amber-700">
          <PartyPopper size={18} className="shrink-0" />
          <span className="text-sm font-semibold">You reached rank {MAX_RANK} — the chain is complete!</span>
        </div>
      )}

      <RanksBar maxRankReached={maxRankReached} rewardRanks={board.rewardRanks} />

      <div className="flex flex-col landscape:flex-row sm:flex-row items-start gap-4 landscape:gap-4 sm:gap-6 w-full">
        <div className="flex flex-col gap-3 w-full" style={{ maxWidth: `${widthRem}rem` }}>
          <div className="bg-gradient-to-br from-indigo-50 via-violet-50 to-fuchsia-50 border border-violet-100 rounded-3xl p-3 sm:p-4 shadow-inner select-none">
            <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {session.state.itemAt.map((row, r) =>
                row.map((rank, c) => {
                  const state = session.state
                  const locked = state.locked[r][c]
                  const stuck = state.stuck[r][c]
                  const movable = rank != null && !stuck
                  const isSelected = selected && selected[0] === r && selected[1] === c
                  const targetKind = selected ? actionFor(session, selected, [r, c]) : null

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
                      title={rank ? `rank ${rank}${stuck ? ' · locked, merge-into only until cleared' : ''}` : locked ? 'locked' : 'open'}
                      className={`relative aspect-square rounded-xl text-white flex flex-col items-center justify-center leading-tight transition-colors shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] ${
                        movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                      } ${tileClass} ${isSelected ? 'ring-4 ring-offset-2 ring-offset-white ring-purple-500' : ''} ${
                        targetKind ? TARGET_STYLE[targetKind] : ''
                      }`}
                      style={rank != null ? { backgroundColor: colorForRank(rank) } : undefined}
                    >
                      {stuck && rank != null && <Lock size={11} className="absolute top-1 left-1 text-white/80" />}
                      {rank != null && <span className="font-display text-lg font-bold drop-shadow-sm">{rank}</span>}
                      {celebration && celebration.row === r && celebration.col === c && (
                        <MergeCelebration key={celebration.key} tier={celebration.tier} />
                      )}
                      {luckyCelebration && luckyCelebration.row === r && luckyCelebration.col === c && (
                        <LuckyDropCelebration key={luckyCelebration.key} tier={luckyCelebration.tier} bonus={luckyCelebration.bonus} />
                      )}
                    </button>
                  )
                }),
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400 play-hide-compact">Drag, or tap an item then tap where to send it, to move or merge.</p>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 play-hide-compact">
            <ArrowDownToLine size={12} className="text-slate-400 shrink-0" />
            {nextBoard ? (
              <span>More board pushes in once this one fully clears</span>
            ) : (
              <span>Final board — no more waves queued</span>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-1">
              <Package size={12} strokeWidth={2.5} /> Inventory
            </span>
            {session.inventory.length === 0 ? (
              <p className="text-xs text-slate-400 px-1">Empty</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 px-1">
                {session.inventory.map((rank, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleInventoryClick(i)}
                    title={`rank ${rank} — click to drop it on a free cell`}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold leading-none shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] transition-transform hover:scale-105"
                    style={{ backgroundColor: colorForRank(rank) }}
                  >
                    {rank}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:gap-4 w-full landscape:w-56 landscape:flex-none sm:w-64 sm:flex-none">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="flex flex-col gap-1 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-2.5 sm:p-3 play-compact-py">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                <Zap size={12} strokeWidth={2.5} /> Generator spends
              </span>
              <span className="font-display text-xl sm:text-2xl font-bold tabular-nums text-amber-700">{session.drSpent}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-fuchsia-50 p-2.5 sm:p-3 play-compact-py">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-purple-700">
                <Trophy size={12} strokeWidth={2.5} /> Highest rank
              </span>
              <span className="font-display text-xl sm:text-2xl font-bold tabular-nums text-purple-700">{maxRankReached || '—'}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5 play-compact-py">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-1">
              <Zap size={12} strokeWidth={2.5} /> Generator
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
                    {unlocked ? null : <Lock size={11} className="shrink-0" />}
                    x{t.cost} → rank {t.normalRank}
                  </span>
                  <span className={chosen ? 'text-purple-600' : 'text-slate-400'}>
                    {chosen ? 'selected' : unlocked ? 'tap to use' : `at rank ${t.unlocksAt}`}
                  </span>
                </button>
              )
            })}
          </div>

          <Button variant="primary" icon={Zap} onClick={handleSpend} disabled={!canSpendGenerator(session)}>
            Use generator (x{activeTier.cost})
          </Button>
        </div>
      </div>
    </div>
  )
}
