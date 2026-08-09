import { useState } from 'react'
import { FileCode2, Copy, Check } from 'lucide-react'
import Card from './ui/Card'
import Button from './ui/Button'
import { boardsToSyntax, boardsSuggestionsToSyntax } from '../lib/boardSyntax'

const VIEWS = [
  { id: 'normal', label: 'Normal' },
  { id: 'cc', label: 'CC' },
]

export default function SyntaxPage({ boards }) {
  const [view, setView] = useState('normal')
  const [copied, setCopied] = useState(false)
  const syntax = view === 'normal' ? boardsToSyntax(boards) : boardsSuggestionsToSyntax(boards)

  async function handleCopy() {
    await navigator.clipboard.writeText(syntax)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card
      title="Syntax export"
      subtitle="Draft export for the Ops handoff — placeholder format, not final; swap it out in src/lib/boardSyntax.js once the real spec exists"
      icon={FileCode2}
      action={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {VIEWS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 ${
                  view === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      }
    >
      <p className="text-xs text-slate-400 mb-3">
        {view === 'normal'
          ? "Every board's actual saved config, in play order — board pushes, semi placements, and blocked queue sequences, everything currently configured."
          : "CC Management's suggestions in the same format — +30%/+50% bigger-wave queues and +8%/+12% lucky-drop EV bumps, per board."}
      </p>
      <pre className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto whitespace-pre">
        {syntax}
      </pre>
    </Card>
  )
}
