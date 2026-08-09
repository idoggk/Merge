import { Boxes, Sparkles } from 'lucide-react'
import Card from './ui/Card'
import { suggestQueues, suggestEv } from '../lib/ccManagement'
import { colorForRank, valueOf } from '../lib/ranks'

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

      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200/70">
        {summary.ranks.length === 0 ? (
          <span className="text-xs text-slate-400 pt-1">No items</span>
        ) : (
          summary.ranks.map((rank, i) => (
            <span
              key={i}
              className="w-9 h-9 rounded-lg flex flex-col items-center justify-center text-white text-xs font-bold leading-none shadow-[inset_0_2px_0_rgba(255,255,255,0.35)]"
              style={{ backgroundColor: colorForRank(rank) }}
            >
              {rank}
              <span className="text-[8px] font-semibold opacity-85">{valueOf(rank)}</span>
            </span>
          ))
        )}
      </div>
    </div>
  )
}

function EvColumn({ label, ev, probs, accent }) {
  const [pNormal, pPlus1, pPlus2] = probs
  return (
    <div className={`flex flex-col gap-2.5 rounded-2xl border p-3.5 ${accent ? 'border-purple-200 bg-gradient-to-br from-purple-50 to-fuchsia-50' : 'border-slate-200 bg-slate-50/60'}`}>
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${accent ? 'text-purple-700' : 'text-slate-500'}`}>{label}</span>
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Target EV</span>
          <span className="font-semibold text-slate-800 tabular-nums">{ev.toFixed(2)}x</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Normal</span>
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
    </div>
  )
}

export default function CCManagement({ boards }) {
  return (
    <div className="flex flex-col gap-6 flex-1 min-w-0">
      {boards.map((board, i) => {
        const { current, plus30, plus50 } = suggestQueues(board, i === 0)
        const ev = suggestEv(board)
        return (
          <Card
            key={board.id}
            title={board.name}
            subtitle="Current queue vs. suggested bigger waves — read-only, nothing here changes the board"
            icon={Boxes}
          >
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SuggestionColumn label="Current" summary={current} />
                <SuggestionColumn label="+30% value" summary={plus30} accent />
                <SuggestionColumn label="+50% value" summary={plus50} accent />
              </div>

              <div className="flex flex-col gap-3 pt-4 border-t border-slate-200">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <Sparkles size={12} strokeWidth={2.5} /> Lucky drop EV
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <EvColumn label="Current" ev={ev.current.ev} probs={ev.current.probs} />
                  <EvColumn label="+8% EV" ev={ev.plus8.ev} probs={ev.plus8.probs} accent />
                  <EvColumn label="+12% EV" ev={ev.plus12.ev} probs={ev.plus12.probs} accent />
                </div>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
