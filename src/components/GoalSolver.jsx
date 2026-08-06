import { useState } from 'react'
import { Target, CheckCircle2, XCircle } from 'lucide-react'
import Card from './ui/Card'
import Button from './ui/Button'
import { solveBoardOneGoal } from '../lib/goalSolver'
import { MIN_RANK, MAX_RANK } from '../lib/ranks'

export default function GoalSolver({ board, onChange }) {
  const [drBudgetInput, setDrBudgetInput] = useState('10')
  const [targetRankInput, setTargetRankInput] = useState('5')
  const [result, setResult] = useState(null)

  function handleSolve() {
    const drBudget = Number(drBudgetInput) || 0
    const targetRank = Math.min(Math.max(Number(targetRankInput) || MIN_RANK, MIN_RANK), MAX_RANK)
    setResult({ ...solveBoardOneGoal(board, { drBudget, targetRank }), targetRank, drBudget })
  }

  function handleApply() {
    if (!result?.feasible) return
    onChange({
      ...board,
      blockedValue: result.blockedValue,
      semiPlacements: result.semiPlacements,
      blockedQueue: result.blockedQueue,
    })
  }

  return (
    <Card
      title="Onboarding goal"
      subtitle="Board 1 only — find the subsidy that gets a player from a DR grant to a target rank"
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm flex flex-col gap-1.5">
            <span className="font-medium text-slate-600">DR the player gets</span>
            <input
              type="number"
              min={0}
              value={drBudgetInput}
              onChange={(e) => setDrBudgetInput(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
            />
          </label>
          <label className="text-sm flex flex-col gap-1.5">
            <span className="font-medium text-slate-600">Target rank</span>
            <input
              type="number"
              min={MIN_RANK}
              max={MAX_RANK}
              value={targetRankInput}
              onChange={(e) => setTargetRankInput(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
            />
          </label>
        </div>

        <Button variant="primary" icon={Target} onClick={handleSolve} className="w-full">
          Solve
        </Button>

        {result?.feasible && (
          <div className="flex flex-col gap-3 text-sm bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <div className="flex items-start gap-2 text-emerald-700">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>
                Blocked value <strong>{result.blockedValue} DR</strong> gets a player with {result.drBudget} DR to
                rank {result.targetRank} (actually costs {result.drSpentToTarget} DR in the simulation).
              </span>
            </div>
            <Button variant="dark" onClick={handleApply} className="w-full">
              Apply to this board
            </Button>
          </div>
        )}

        {result && !result.feasible && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <XCircle size={16} className="mt-0.5 shrink-0" />
            <span>
              Not achievable on this board's current tile layout, even at maximum subsidy — try a lower target rank,
              a bigger DR grant, or more blocked/semi tiles.
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}
