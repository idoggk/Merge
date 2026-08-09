import { useEffect, useRef, useState } from 'react'
import { Gift } from 'lucide-react'
import MergeCelebration from './MergeCelebration'
import { colorForRank, MIN_RANK, MAX_RANK } from '../lib/ranks'

const ALL_RANKS = Array.from({ length: MAX_RANK - MIN_RANK + 1 }, (_, i) => i + MIN_RANK)
const POP_DURATION = 900

// A game-style event-track bar: a fill showing overall progress toward
// MAX_RANK, with one node per rank sitting on it. Reward ranks (see
// BoardEditor's "Rank rewards" card) get a gift badge. Detects its own
// "just reached a new rank" moment (comparing against the previous render's
// maxRankReached) rather than requiring the caller to signal it, so it stays
// a drop-in progress display - a plain milestone pops with a scale+glow; a
// milestone that's ALSO a reward rank additionally gets a MergeCelebration
// burst, since a reward is meant to feel like a bigger deal than a plain
// rank tick.
export default function RanksBar({ maxRankReached, rewardRanks = [] }) {
  const [justReached, setJustReached] = useState(null)
  const prevRank = useRef(maxRankReached)
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (maxRankReached > prevRank.current) {
      setJustReached(maxRankReached)
      clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setJustReached(null), POP_DURATION)
    }
    prevRank.current = maxRankReached
  }, [maxRankReached])

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const pct = Math.max(0, Math.min(100, (maxRankReached / MAX_RANK) * 100))

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-violet-100 bg-gradient-to-r from-indigo-50 via-violet-50 to-fuchsia-50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rank progress</span>
        <span className="font-display text-sm font-bold text-purple-700 tabular-nums">
          {maxRankReached || '—'} / {MAX_RANK}
        </span>
      </div>

      <div className="h-2.5 rounded-full bg-white/70 shadow-inner overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-purple-500 to-amber-400 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between">
        {ALL_RANKS.map((rank) => {
          const reached = rank <= maxRankReached
          const isReward = rewardRanks.includes(rank)
          const pop = justReached === rank
          return (
            <div key={rank} className="relative flex flex-col items-center" style={{ width: `${100 / MAX_RANK}%` }}>
              <div
                className={`relative w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-transform duration-300 ${
                  pop ? 'scale-[1.35]' : ''
                }`}
                style={{
                  backgroundColor: reached ? colorForRank(rank) : '#e2e8f0',
                  color: reached ? '#fff' : '#94a3b8',
                  boxShadow: pop ? `0 0 0 6px ${isReward ? 'rgba(251,191,36,0.4)' : 'rgba(168,85,247,0.3)'}` : undefined,
                }}
              >
                {rank}
                {isReward && (
                  <span
                    className={`absolute -top-2 -right-2 w-3.5 h-3.5 rounded-full flex items-center justify-center shadow ${
                      reached ? 'bg-amber-400' : 'bg-slate-300'
                    }`}
                  >
                    <Gift size={8} strokeWidth={3} className="text-white" />
                  </span>
                )}
                {pop && isReward && <MergeCelebration key={rank} tier="medium" />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
