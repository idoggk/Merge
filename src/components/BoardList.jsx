import { ChevronUp, ChevronDown, Copy, Trash2, Plus, LayoutGrid, Coins } from 'lucide-react'
import NumberField from './ui/NumberField'
import GoalSolver from './GoalSolver'
import { invalidateLayout } from '../lib/board'
import { MIN_RANK, MAX_RANK, valueOf } from '../lib/ranks'

export default function BoardList({ boards, activeId, onSelect, onAdd, onDuplicate, onRemove, onMove, onUpdateBoard }) {
  return (
    <div className="flex flex-col gap-3 w-72 shrink-0">
      <h2 className="font-display text-sm font-bold text-slate-800 px-1 tracking-tight">Boards</h2>

      <ul className="flex flex-col gap-1.5">
        {boards.map((board, i) => {
          const active = board.id === activeId
          return (
            <li
              key={board.id}
              className={`group relative flex flex-col gap-1 rounded-2xl border px-2.5 py-2 transition-all duration-150 overflow-hidden ${
                active
                  ? 'border-purple-200 bg-gradient-to-r from-purple-50 to-fuchsia-50 shadow-sm'
                  : 'border-transparent bg-white/70 hover:border-slate-200 hover:bg-white'
              }`}
            >
              {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-gradient-to-b from-purple-500 to-fuchsia-500" />}
              <div className="flex items-center gap-1">
                <button type="button" className="flex-1 flex items-center gap-2 text-left min-w-0 pl-1" onClick={() => onSelect(board.id)}>
                  <LayoutGrid size={15} className={active ? 'text-purple-500' : 'text-slate-400'} />
                  <span className={`text-sm truncate ${active ? 'text-purple-900 font-semibold' : 'text-slate-700'}`}>{board.name}</span>
                  {i === 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white font-semibold shrink-0">
                      special
                    </span>
                  )}
                </button>

                <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button type="button" title="Move up" disabled={i === 0} onClick={() => onMove(i, i - 1)} className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-0">
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" title="Move down" disabled={i === boards.length - 1} onClick={() => onMove(i, i + 1)} className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-0">
                    <ChevronDown size={14} />
                  </button>
                  <button type="button" title="Duplicate" onClick={() => onDuplicate(board.id)} className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    title="Remove"
                    disabled={boards.length <= 1}
                    onClick={() => onRemove(board.id)}
                    className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {active && (
                <div className="flex flex-col gap-3 pt-2.5 mt-1 pl-1 border-t border-purple-200/60">
                  <div className="flex flex-col gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <Coins size={12} strokeWidth={2.5} /> Subsidy & rank window
                    </span>
                    <NumberField
                      label="Blocked value (DR)"
                      min={0}
                      max={valueOf(MAX_RANK)}
                      hint={`Can't exceed ${valueOf(MAX_RANK)} — the full chain's total value`}
                      value={board.blockedValue}
                      onChange={(e) =>
                        onUpdateBoard(invalidateLayout(board, { blockedValue: Math.min(Number(e.target.value) || 0, valueOf(MAX_RANK)) }))
                      }
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField
                        label="Min rank"
                        min={MIN_RANK}
                        max={MAX_RANK}
                        value={board.minRank}
                        onChange={(e) => onUpdateBoard(invalidateLayout(board, { minRank: Number(e.target.value) || MIN_RANK }))}
                      />
                      <NumberField
                        label="Max rank"
                        min={MIN_RANK}
                        max={MAX_RANK}
                        value={board.maxRank}
                        onChange={(e) => onUpdateBoard(invalidateLayout(board, { maxRank: Number(e.target.value) || MAX_RANK }))}
                      />
                    </div>
                  </div>

                  {i === 0 && (
                    <div className="pt-2.5 border-t border-purple-200/60">
                      <GoalSolver board={board} onChange={onUpdateBoard} />
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 text-sm font-medium py-2 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50/50 transition-colors"
      >
        <Plus size={15} /> Add board
      </button>
    </div>
  )
}
