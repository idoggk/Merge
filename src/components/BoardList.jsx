import { ChevronUp, ChevronDown, Copy, Trash2, Plus, LayoutGrid } from 'lucide-react'

export default function BoardList({ boards, activeId, onSelect, onAdd, onDuplicate, onRemove, onMove }) {
  return (
    <div className="flex flex-col gap-3 w-64 shrink-0">
      <h2 className="text-sm font-semibold text-slate-800 px-1">Boards</h2>

      <ul className="flex flex-col gap-1.5">
        {boards.map((board, i) => {
          const active = board.id === activeId
          return (
            <li
              key={board.id}
              className={`group flex items-center gap-1 rounded-xl border px-2.5 py-2 transition-colors ${
                active ? 'border-purple-300 bg-purple-50' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <button type="button" className="flex-1 flex items-center gap-2 text-left min-w-0" onClick={() => onSelect(board.id)}>
                <LayoutGrid size={15} className={active ? 'text-purple-500' : 'text-slate-400'} />
                <span className={`text-sm truncate ${active ? 'text-purple-900 font-medium' : 'text-slate-700'}`}>{board.name}</span>
                {i === 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 font-medium shrink-0">special</span>
                )}
              </button>

              <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button type="button" title="Move up" disabled={i === 0} onClick={() => onMove(i, i - 1)} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-0">
                  <ChevronUp size={14} />
                </button>
                <button type="button" title="Move down" disabled={i === boards.length - 1} onClick={() => onMove(i, i + 1)} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-0">
                  <ChevronDown size={14} />
                </button>
                <button type="button" title="Duplicate" onClick={() => onDuplicate(board.id)} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                  <Copy size={13} />
                </button>
                <button
                  type="button"
                  title="Remove"
                  disabled={boards.length <= 1}
                  onClick={() => onRemove(board.id)}
                  className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm py-2 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50/50 transition-colors"
      >
        <Plus size={15} /> Add board
      </button>
    </div>
  )
}
