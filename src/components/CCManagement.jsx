import { Boxes } from 'lucide-react'
import Card from './ui/Card'
import { suggestQueues } from '../lib/ccManagement'
import { colorForRank } from '../lib/ranks'

function rankHistogram(ranks) {
  const counts = new Map()
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => a[0] - b[0])
}

function SuggestionColumn({ label, summary, accent }) {
  return (
    <div className={`flex flex-col gap-2.5 rounded-2xl border p-3.5 ${accent ? 'border-purple-200 bg-gradient-to-br from-purple-50 to-fuchsia-50' : 'border-slate-200 bg-slate-50/60'}`}>
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${accent ? 'text-purple-700' : 'text-slate-500'}`}>{label}</span>

      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Blocked value</span>
          <span className="font-semibold text-slate-800 tabular-nums">{summary.blockedValue} DR</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Max rank</span>
          <span className="font-semibold text-slate-800 tabular-nums">{summary.maxRank}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Items</span>
          <span className="font-semibold text-slate-800 tabular-nums">
            {summary.itemCount} / {summary.tileCount} tiles
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200/70">
        {summary.ranks.length === 0 ? (
          <span className="text-xs text-slate-400 pt-1">No items</span>
        ) : (
          rankHistogram(summary.ranks).map(([rank, count]) => (
            <span
              key={rank}
              className="flex items-center gap-1 text-[11px] font-bold text-white rounded-md px-1.5 py-1 mt-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
              style={{ backgroundColor: colorForRank(rank) }}
            >
              ×{count} R{rank}
            </span>
          ))
        )}
      </div>
    </div>
  )
}

export default function CCManagement({ boards }) {
  return (
    <div className="flex flex-col gap-6 flex-1 min-w-0">
      {boards.map((board, i) => {
        const { current, plus30, plus50 } = suggestQueues(board, i === 0)
        return (
          <Card
            key={board.id}
            title={board.name}
            subtitle="Current queue vs. suggested bigger waves — read-only, nothing here changes the board"
            icon={Boxes}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <SuggestionColumn label="Current" summary={current} />
              <SuggestionColumn label="+30% value" summary={plus30} accent />
              <SuggestionColumn label="+50% value" summary={plus50} accent />
            </div>
          </Card>
        )
      })}
    </div>
  )
}
