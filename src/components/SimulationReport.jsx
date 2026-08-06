import { useEffect, useState } from 'react'
import { PlayCircle, AlertCircle } from 'lucide-react'
import Card from './ui/Card'
import Button from './ui/Button'
import { simulatePlaythrough } from '../lib/mergeSimulation'
import { colorForRank, MIN_RANK, MAX_RANK } from '../lib/ranks'

const STOP_REASON_LABEL = {
  'max-rank-reached': 'reached rank 12',
  'no-legal-move': 'stuck — no legal merge and no room to spawn',
  'budget-exhausted': 'DR budget ran out',
  'max-steps': 'hit the simulation step safety limit',
}

const RANKS = Array.from({ length: MAX_RANK - MIN_RANK + 1 }, (_, i) => i + MIN_RANK)

export default function SimulationReport({ board }) {
  const [drBudgetInput, setDrBudgetInput] = useState('')
  const [result, setResult] = useState(null)

  // A stale report (from before the layout changed) would be misleading.
  useEffect(() => {
    setResult(null)
  }, [board.semiPlacements, board.blockedQueue])

  const hasSubsidyTiles = board.tiles.some((row) => row.some((s) => s === 'blocked' || s === 'semi'))
  const needsGeneration = hasSubsidyTiles && board.semiPlacements.length === 0 && board.blockedQueue.length === 0

  function handleRun() {
    const trimmed = drBudgetInput.trim()
    const drBudget = trimmed === '' ? Infinity : Number(trimmed) || 0
    setResult(simulatePlaythrough(board, { drBudget }))
  }

  const maxDr = result ? Math.max(1, ...Object.values(result.reachedAt)) : 0

  return (
    <Card
      title="Playthrough simulation"
      subtitle="Simulated DR spent to first reach each rank, merging this board's items"
      className="flex-1 min-w-64"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-3">
          <label className="text-sm flex flex-col gap-1.5 flex-1">
            <span className="font-medium text-slate-600">DR budget (blank = unlimited)</span>
            <input
              type="number"
              min={0}
              placeholder="Unlimited"
              value={drBudgetInput}
              onChange={(e) => setDrBudgetInput(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
            />
          </label>
          <Button variant="primary" icon={PlayCircle} onClick={handleRun} disabled={needsGeneration}>
            Run
          </Button>
        </div>

        {needsGeneration && (
          <p className="text-xs text-amber-600">
            This board has blocked/semi tiles with no generated items yet — generate items above first, or the
            simulation won't reflect them.
          </p>
        )}

        {result && (
          <>
            <div className="grid grid-cols-[5rem_1fr_4rem] gap-y-1.5 items-center text-sm">
              {RANKS.map((rank) => {
                const dr = result.reachedAt[rank]
                const pct = dr == null ? 0 : (Math.log(dr + 1) / Math.log(maxDr + 1)) * 100
                return (
                  <div key={rank} className="contents">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorForRank(rank) }} />
                      Rank {rank}
                    </span>
                    <div className="bg-slate-100 rounded h-2 overflow-hidden">
                      {dr != null && (
                        <div className="h-full rounded" style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: colorForRank(rank) }} />
                      )}
                    </div>
                    <span className="text-right tabular-nums text-slate-500">{dr ?? '—'}</span>
                  </div>
                )
              })}
            </div>

            <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>
                Stopped after {result.drSpent} DR — {STOP_REASON_LABEL[result.stopReason] ?? result.stopReason}.
              </span>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
