import { useState } from 'react'
import { Boxes, FileCode2, Copy, Check } from 'lucide-react'
import Card from './ui/Card'
import Button from './ui/Button'
import { suggestQueues } from '../lib/ccManagement'
import { boardsToSyntax } from '../lib/boardSyntax'
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

function BoardSyntaxCard({ boards }) {
  const [copied, setCopied] = useState(false)
  const syntax = boardsToSyntax(boards)

  async function handleCopy() {
    await navigator.clipboard.writeText(syntax)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card
      title="Board syntax"
      subtitle="Draft export for the Ops handoff — placeholder format, not final; swap it out in src/lib/boardSyntax.js once the real spec exists"
      icon={FileCode2}
      action={
        <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy all'}
        </Button>
      }
    >
      <pre className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto whitespace-pre">
        {syntax}
      </pre>
    </Card>
  )
}

export default function CCManagement({ boards }) {
  return (
    <div className="flex flex-col gap-6 flex-1 min-w-0">
      <BoardSyntaxCard boards={boards} />

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
