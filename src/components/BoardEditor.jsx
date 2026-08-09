import { useMemo, useState } from 'react'
import {
  Wand2,
  BookmarkPlus,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Grid2x2,
  Coins,
  ListOrdered,
  Layers,
  Sparkles,
  Gift,
} from 'lucide-react'
import BoardGrid from './BoardGrid'
import SimulationReport from './SimulationReport'
import GoalSolver from './GoalSolver'
import Card from './ui/Card'
import Button from './ui/Button'
import NumberField from './ui/NumberField'
import Slider from './ui/Slider'
import { resizeTiles, gridWidthRem } from '../lib/board'
import { placeItems } from '../lib/placement'
import { MIN_RANK, MAX_RANK, colorForRank, valueOf } from '../lib/ranks'
import { applyPresetToBoard, createPreset } from '../lib/presets'
import { DEFAULT_TARGET_EV, MIN_TARGET_EV, MAX_TARGET_EV, computeProbs } from '../lib/luckyDrop'
import { TIER2_UNLOCK_RANK } from '../lib/generatorTier'

const ALL_RANKS = Array.from({ length: MAX_RANK - MIN_RANK + 1 }, (_, i) => i + MIN_RANK)

export default function BoardEditor({ board, boards, boardIndex, isFirstBoard, presets, onChange, onSavePreset }) {
  const [noise, setNoise] = useState(0.15)
  const [presetName, setPresetName] = useState('')

  const blockedTileCount = useMemo(
    () => board.tiles.flat().filter((s) => s === 'blocked' || s === 'semi').length,
    [board.tiles],
  )

  const stats = useMemo(() => {
    const itemCount = board.semiPlacements.length + board.blockedQueue.length
    const sum =
      board.semiPlacements.reduce((s, p) => s + valueOf(p.rank), 0) +
      board.blockedQueue.reduce((s, r) => s + valueOf(r), 0)
    // Board 0 only guarantees small ranks (1-3) plus maxRank, not minRank —
    // its variety check is max-only; other boards check both ends.
    const isRange = board.minRank < board.maxRank
    const allRanks = [...board.semiPlacements.map((p) => p.rank), ...board.blockedQueue]
    const hasMax = allRanks.includes(board.maxRank)
    const hasRangeVariety = !isRange ? null : isFirstBoard ? hasMax : hasMax && allRanks.includes(board.minRank)
    return {
      hasLayout: itemCount > 0,
      itemCount,
      sum,
      hasRangeVariety,
    }
  }, [board.semiPlacements, board.blockedQueue, board.minRank, board.maxRank, isFirstBoard])

  // Plain edits (dimensions, tile paint, subsidy, rank window) invalidate any
  // already-generated layout — it no longer matches the new configuration.
  function updateBoard(patch) {
    onChange({ ...board, ...patch, semiPlacements: [], blockedQueue: [], onboardingStatus: null })
  }

  function handleDimensionChange(rows, cols) {
    updateBoard({ rows, cols, tiles: resizeTiles(board.tiles, rows, cols) })
  }

  function handlePaint(r, c, state) {
    const tiles = board.tiles.map((row) => [...row])
    tiles[r][c] = state
    updateBoard({ tiles })
  }

  function handleFillAll(state) {
    const tiles = Array.from({ length: board.rows }, () => Array.from({ length: board.cols }, () => state))
    updateBoard({ tiles })
  }

  function handleGenerate() {
    const onboarding =
      isFirstBoard && board.onboardingDrBudget != null && board.onboardingTargetRank != null
        ? { drBudget: board.onboardingDrBudget, targetRank: board.onboardingTargetRank }
        : null
    const generated = placeItems(board, { isFirstBoard, noise, onboarding })
    onChange({
      ...board,
      semiPlacements: generated.semiPlacements,
      blockedQueue: generated.blockedQueue,
      onboardingStatus: generated.onboardingStatus,
    })
  }

  function moveQueueItem(from, to) {
    if (to < 0 || to >= board.blockedQueue.length) return
    const next = [...board.blockedQueue]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    // The onboarding guarantee (if any) was validated against a specific
    // front-loaded order — a manual reorder may no longer honor it, so don't
    // keep claiming it does.
    onChange({ ...board, blockedQueue: next, onboardingStatus: null })
  }

  // Unlike updateBoard's other callers, targetEv doesn't affect item
  // generation/placement at all - it's purely a generator-RNG parameter
  // read at play time - so it shouldn't invalidate an already-generated
  // layout the way dimension/tile/subsidy/rank-window edits do.
  function updateTargetEv(targetEv) {
    onChange({ ...board, targetEv })
  }

  // Also doesn't affect generation/placement - purely a marker the play
  // tester's ranks bar reads to decide which checkpoints get a reward badge.
  function toggleRewardRank(rank) {
    const rewardRanks = board.rewardRanks.includes(rank)
      ? board.rewardRanks.filter((r) => r !== rank)
      : [...board.rewardRanks, rank].sort((a, b) => a - b)
    onChange({ ...board, rewardRanks })
  }

  function handleApplyPreset(preset) {
    updateBoard({ tiles: applyPresetToBoard(preset, board.rows, board.cols) })
  }

  function handleSavePreset() {
    if (!presetName.trim()) return
    onSavePreset(createPreset(presetName.trim(), board))
    setPresetName('')
  }

  // Sum can legitimately come in ABOVE target (never below) - see
  // generateCandidateInRange/raiseUndersized: when target isn't a multiple
  // of valueOf(minRank), there's no exact way to keep every item at or
  // above minRank, so it rounds up by the smallest amount that fixes that.
  const sumOk = stats.hasLayout && stats.sum >= board.blockedValue
  const overallocated = stats.hasLayout && stats.sum > board.blockedValue
  const countOk = stats.hasLayout && stats.itemCount === blockedTileCount
  const varietyOk = stats.hasRangeVariety !== false

  const targetEv = board.targetEv ?? DEFAULT_TARGET_EV
  const [pNormal, pPlus1, pPlus2] = computeProbs(targetEv)

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex flex-col gap-6">
        <Card
          title={board.name}
          subtitle={`${blockedTileCount} blocked/semi tile${blockedTileCount === 1 ? '' : 's'} to fill`}
          icon={Grid2x2}
          className="shrink-0"
        >
          <div className="flex flex-wrap gap-4 mb-4">
            <NumberField
              label="Rows"
              min={1}
              max={isFirstBoard ? 20 : 3}
              hint={isFirstBoard ? undefined : 'Boards after the first push in as a wave of rows once the previous board clears out — capped at 3'}
              value={board.rows}
              onChange={(e) => handleDimensionChange(Math.min(Number(e.target.value) || 1, isFirstBoard ? 20 : 3), board.cols)}
              className="w-36"
            />
            <NumberField
              label="Columns"
              min={1}
              max={20}
              hint={isFirstBoard ? undefined : "Keep this matching Board 1's columns so the pushed-in rows line up cleanly"}
              value={board.cols}
              onChange={(e) => handleDimensionChange(board.rows, Number(e.target.value) || 1)}
              className="w-36"
            />
          </div>
          <BoardGrid tiles={board.tiles} placements={board.semiPlacements} onPaint={handlePaint} onFillAll={handleFillAll} />
        </Card>

        <Card title="Blocked queue" subtitle="Reveal order for blocked tiles — reorder to control pacing" icon={ListOrdered}>
          {board.blockedQueue.length === 0 ? (
            <p className="text-sm text-slate-400">Generate items to populate the queue.</p>
          ) : (
            <div className="flex flex-wrap gap-2" style={{ maxWidth: `${gridWidthRem(board.cols)}rem` }}>
              {board.blockedQueue.map((rank, i) => (
                <div key={i} className="flex flex-col items-center gap-1 border border-slate-200 rounded-xl p-1.5 w-16 bg-slate-50/60 hover:border-purple-200 transition-colors">
                  <span
                    className="w-9 h-9 rounded-lg flex flex-col items-center justify-center text-white text-xs font-bold leading-none shadow-[inset_0_2px_0_rgba(255,255,255,0.35)]"
                    style={{ backgroundColor: colorForRank(rank) }}
                  >
                    {rank}
                    <span className="text-[8px] font-semibold opacity-85">{valueOf(rank)}</span>
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      title="Move earlier"
                      disabled={i === 0}
                      onClick={() => moveQueueItem(i, i - 1)}
                      className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20"
                    >
                      <ChevronLeft size={12} />
                    </button>
                    <span className="text-[10px] text-slate-400">{i + 1}</span>
                    <button
                      type="button"
                      title="Move later"
                      disabled={i === board.blockedQueue.length - 1}
                      onClick={() => moveQueueItem(i, i + 1)}
                      className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20"
                    >
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-6 flex-1 min-w-72">
        <Card
          title="Subsidy & rank window"
          subtitle="Blocked-tile value and the allowed item rank range"
          icon={Coins}
          className="flex-1 min-w-64"
        >
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Blocked value (DR)"
              className="col-span-2"
              min={0}
              max={valueOf(MAX_RANK)}
              hint={`Can't exceed ${valueOf(MAX_RANK)} — the full chain's total value`}
              value={board.blockedValue}
              onChange={(e) =>
                updateBoard({ blockedValue: Math.min(Number(e.target.value) || 0, valueOf(MAX_RANK)) })
              }
            />
            <NumberField
              label="Min rank"
              min={MIN_RANK}
              max={MAX_RANK}
              value={board.minRank}
              onChange={(e) => updateBoard({ minRank: Number(e.target.value) || MIN_RANK })}
            />
            <NumberField
              label="Max rank"
              min={MIN_RANK}
              max={MAX_RANK}
              value={board.maxRank}
              onChange={(e) => updateBoard({ maxRank: Number(e.target.value) || MAX_RANK })}
            />
          </div>
        </Card>

        <Card
          title="Lucky drops"
          subtitle="Chance the generator drops a higher rank than normal"
          icon={Sparkles}
          className="flex-1 min-w-64"
        >
          <div className="flex flex-col gap-4">
            <NumberField
              label="Target EV multiple"
              min={MIN_TARGET_EV}
              max={MAX_TARGET_EV}
              step={0.01}
              hint={`1.05 = generator taps are worth 5% more value on average, once unlocked — can't exceed ${MAX_TARGET_EV.toFixed(2)} (the model's own ceiling)`}
              value={targetEv}
              onChange={(e) => {
                const raw = Math.min(Math.max(Number(e.target.value) || DEFAULT_TARGET_EV, MIN_TARGET_EV), MAX_TARGET_EV)
                // Round to 2dp for display - MAX_TARGET_EV (7/3) isn't a
                // clean decimal, so clamping straight to it would otherwise
                // show "2.3333333333333335" the moment someone types past it.
                updateTargetEv(Math.round(raw * 100) / 100)
              }}
            />

            <div className="flex flex-col gap-2 text-sm bg-slate-50/80 border border-slate-200 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Normal (same rank)</span>
                <span className="font-semibold text-slate-800 tabular-nums">{(pNormal * 100).toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">+1 rank</span>
                <span className="font-semibold text-emerald-600 tabular-nums">{(pPlus1 * 100).toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">+2 ranks</span>
                <span className="font-semibold text-purple-600 tabular-nums">{(pPlus2 * 100).toFixed(1)}%</span>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Only unlocks once the player holds a rank-{TIER2_UNLOCK_RANK} item — same threshold as the x2
              generator tier. Every tap before that is a guaranteed normal roll.
            </p>
          </div>
        </Card>

        <Card
          title="Rank rewards"
          subtitle="Optional — mark ranks that give the player a reward on first reaching them"
          icon={Gift}
          className="flex-1 min-w-64"
        >
          <div className="flex flex-wrap gap-2">
            {ALL_RANKS.map((rank) => {
              const active = board.rewardRanks.includes(rank)
              return (
                <button
                  key={rank}
                  type="button"
                  onClick={() => toggleRewardRank(rank)}
                  title={active ? `Rank ${rank} gives a reward — click to remove` : `Mark rank ${rank} as a reward rank`}
                  className={`relative w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] transition-all ${
                    active ? 'ring-2 ring-offset-2 ring-offset-white ring-amber-400' : 'opacity-40 hover:opacity-70'
                  }`}
                  style={{ backgroundColor: colorForRank(rank) }}
                >
                  {rank}
                  {active && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 text-white flex items-center justify-center shadow">
                      <Gift size={10} strokeWidth={3} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {board.rewardRanks.length === 0 && (
            <p className="text-xs text-slate-400 mt-3">No reward ranks set — entirely optional, doesn't affect generation.</p>
          )}
        </Card>

        <Card
          title="Placement"
          subtitle="Generate items and place them by distance-to-player"
          icon={Wand2}
          className="flex-1 min-w-64"
        >
          <div className="flex flex-col gap-4">
            <Slider
              label="Noise"
              valueLabel={noise.toFixed(2)}
              min={0}
              max={1}
              step={0.05}
              value={noise}
              onChange={(e) => setNoise(Number(e.target.value))}
            />

            <Button variant="primary" icon={Wand2} onClick={handleGenerate} className="w-full">
              Generate items
            </Button>

            {stats.hasLayout && (
              <div className="flex flex-col gap-2 text-sm bg-slate-50/80 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Sum vs. target</span>
                  <span className={`flex items-center gap-1 font-medium ${sumOk ? 'text-emerald-600' : 'text-red-600'}`}>
                    {sumOk ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {stats.sum} / {board.blockedValue}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Items vs. tiles</span>
                  <span className={`flex items-center gap-1 font-medium ${countOk ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {countOk ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {stats.itemCount} / {blockedTileCount}
                  </span>
                </div>
                {stats.hasRangeVariety !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{isFirstBoard ? 'Max tier present' : 'Min & max both present'}</span>
                    <span className={`flex items-center gap-1 font-medium ${varietyOk ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {varietyOk ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                      {varietyOk ? 'yes' : 'no'}
                    </span>
                  </div>
                )}
                {overallocated && (
                  <p className="text-xs text-amber-600">
                    Rounded up by {stats.sum - board.blockedValue} DR — {board.blockedValue} isn't a multiple of{' '}
                    {valueOf(board.minRank)} (this board's min rank's value), so keeping every item at rank{' '}
                    {board.minRank}+ needs slightly more than the exact target.
                  </p>
                )}
                {!countOk && <p className="text-xs text-amber-600">Best-effort undershoot — rank window couldn't be fully satisfied.</p>}
                {!varietyOk && (
                  <p className="text-xs text-amber-600">
                    {isFirstBoard
                      ? 'Not enough DR to reserve the small-rank set plus a max-rank item.'
                      : 'Not enough DR to reserve one min-rank and one max-rank item on this board.'}
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>

        {isFirstBoard && <GoalSolver board={board} onChange={onChange} />}

        <SimulationReport board={board} boards={boards} boardIndex={boardIndex} />

        <Card
          title="Suggestions"
          subtitle="Save a layout you like, apply it elsewhere"
          icon={Layers}
          className="flex-1 min-w-64"
        >
          <div className="flex flex-col gap-3">
            {presets.length === 0 ? (
              <p className="text-sm text-slate-400">No saved suggestions yet — design a layout, then save it below.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="text-left text-sm border border-slate-200 rounded-xl px-3 py-2 hover:border-purple-300 hover:bg-purple-50/50 transition-colors flex items-center justify-between"
                  >
                    <span className="text-slate-700 font-medium">{preset.name}</span>
                    <span className="text-xs text-slate-400">{preset.rows}×{preset.cols}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name this layout..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-4 focus:ring-purple-200/60 focus:border-purple-400"
              />
              <Button icon={BookmarkPlus} onClick={handleSavePreset}>
                Save
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
