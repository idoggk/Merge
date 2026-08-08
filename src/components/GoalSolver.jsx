import { Target, CheckCircle2, AlertTriangle } from 'lucide-react'
import Card from './ui/Card'
import NumberField from './ui/NumberField'
import { MIN_RANK, MAX_RANK } from '../lib/ranks'

const INFEASIBLE_MESSAGE = {
  'insufficient-subsidy': (status) =>
    `This board's blocked value isn't enough — reaching this goal needs at least ${status.reservedValueNeeded} DR reserved for it. Raise "Blocked value (DR)" above, or lower the target rank / raise the DR grant.`,
  'insufficient-tiles': (status) =>
    `This board doesn't have enough blocked/semi tiles to hold the items this goal needs (${status.itemsNeeded} items). Add more blocked/semi tiles, or lower the target rank.`,
  unreachable: () => "This goal isn't reachable at all on this board's tile layout — try a lower target rank or a bigger DR grant.",
  'tile-budget-too-tight': () =>
    "This board's blocked/semi tiles are too few to host this goal's reserve without losing some of the board's value elsewhere. Add more blocked/semi tiles, or lower the target rank.",
  'blocked-by-other-subsidy': () =>
    "This board's other semi tiles ended up with a bigger item than this goal's own reserve, which takes over as the board's one usable subsidy anchor and breaks the guarantee. Try regenerating, using fewer semi tiles, or lowering the target rank.",
}

export default function GoalSolver({ board, onChange }) {
  const status = board.onboardingStatus
  const goalSet = board.onboardingDrBudget != null && board.onboardingTargetRank != null

  function update(patch) {
    onChange({ ...board, ...patch, semiPlacements: [], blockedQueue: [], onboardingStatus: null })
  }

  return (
    <Card
      title="Onboarding goal"
      subtitle="Board 1 only — reserves the first part of this board's items so a player reaches a target rank within a DR grant"
      icon={Target}
      className="flex-1 min-w-64"
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="DR the player gets"
            min={0}
            value={board.onboardingDrBudget ?? ''}
            onChange={(e) => update({ onboardingDrBudget: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <NumberField
            label="Target rank"
            min={MIN_RANK}
            max={MAX_RANK}
            value={board.onboardingTargetRank ?? ''}
            onChange={(e) => update({ onboardingTargetRank: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>

        {goalSet && !status && (
          <p className="text-xs text-slate-400">Click "Generate items" to reserve items for this goal.</p>
        )}

        {status?.feasible && (
          <div className="flex items-start gap-2.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <span className="mt-0.5 shrink-0 grid place-items-center w-5 h-5 rounded-full bg-emerald-500 text-white">
              <CheckCircle2 size={13} strokeWidth={2.5} />
            </span>
            <span>
              Reserved {status.reservedValue} DR up front (out of this board's total blocked value) — reaches rank{' '}
              {board.onboardingTargetRank} using {status.drSpentToTarget} of the {board.onboardingDrBudget} DR grant.
              The rest of the board's subsidy generates normally around it.
            </span>
          </div>
        )}

        {status && !status.feasible && (
          <div className="flex items-start gap-2.5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
            <span className="mt-0.5 shrink-0 grid place-items-center w-5 h-5 rounded-full bg-red-500 text-white">
              <AlertTriangle size={13} strokeWidth={2.5} />
            </span>
            <span>{INFEASIBLE_MESSAGE[status.reason]?.(status) ?? 'This goal could not be satisfied.'}</span>
          </div>
        )}
      </div>
    </Card>
  )
}
