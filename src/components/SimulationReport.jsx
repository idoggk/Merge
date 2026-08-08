import { useEffect, useState } from 'react'
import { PlayCircle, AlertCircle, LineChart } from 'lucide-react'
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

export default function SimulationReport({ board, boards, boardIndex }) {
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
    setResult(simulatePlaythrough(boards, { startIndex: boardIndex, drBudget }))
  }

  const maxDr = result ? Math.max(1, ...Object.values(result.reachedAt)) : 0

  return (
    <Card
      title="Playthrough simulation"
      subtitle="Simulated DR spent, and generator taps needed, to first reach each rank"
      icon={LineChart}
      className="flex-1 min-w-64"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-3">
          <label className="text-sm flex flex-col gap-1.5 flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">DR budget (blank = unlimited)</span>
            <input
              type="number"
              min={0}
              placeholder="Unlimited"
              value={drBudgetInput}
              onChange={(e) => setDrBudgetInput(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-medium bg-white/70 focus:outline-none focus:ring-4 focus:ring-purple-200/60 focus:border-purple-400"
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
            <div className="grid grid-cols-[5rem_1fr_4rem_5rem] gap-y-1.5 items-center text-sm">
              <div className="contents text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <span />
                <span />
                <span className="text-right">DR</span>
                <span className="text-right">Taps</span>
              </div>
              {RANKS.map((rank) => {
                const dr = result.reachedAt[rank]
                const pct = dr == null ? 0 : (Math.log(dr + 1) / Math.log(maxDr + 1)) * 100
                const taps = result.tapsAt[rank]
                const prevTaps = result.tapsAt[rank - 1] ?? 0
                const tapsDelta = taps != null ? taps - prevTaps : null
                return (
                  <div key={rank} className="contents">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorForRank(rank) }} />
                      Rank {rank}
                    </span>
                    <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                      {dr != null && (
                        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: colorForRank(rank) }} />
                      )}
                    </div>
                    <span className="text-right tabular-nums font-medium text-slate-500">{dr ?? '—'}</span>
                    <span className="text-right tabular-nums text-slate-400">
                      {tapsDelta != null ? `+${tapsDelta} tap${tapsDelta === 1 ? '' : 's'}` : ''}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>
                Stopped after {result.drSpent} DR — {STOP_REASON_LABEL[result.stopReason] ?? result.stopReason}.
                {result.inventoryRemaining > 0 &&
                  ` ${result.inventoryRemaining} item${result.inventoryRemaining === 1 ? '' : 's'} from pushed-in boards never made it back onto the board.`}
              </span>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
