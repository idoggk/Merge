import { useState } from 'react'
import { Save, Puzzle, LayoutGrid, Gamepad2 } from 'lucide-react'
import BoardList from './components/BoardList'
import BoardEditor from './components/BoardEditor'
import PlayTester from './components/PlayTester'
import Button from './components/ui/Button'
import { createBoard, cloneBoard } from './lib/board'
import { loadState, saveState } from './lib/persistence'

const MODES = [
  { id: 'editor', label: 'Editor', icon: LayoutGrid },
  { id: 'play', label: 'Play tester', icon: Gamepad2 },
]

function initialState() {
  const persisted = loadState()
  if (persisted?.boards?.length) {
    return {
      ...persisted,
      boards: persisted.boards.map((b) => ({
        semiPlacements: [],
        blockedQueue: [],
        onboardingDrBudget: null,
        onboardingTargetRank: null,
        onboardingStatus: null,
        ...b,
      })),
    }
  }
  const first = createBoard('Board 1')
  return { boards: [first], presets: [] }
}

function App() {
  const [state, setState] = useState(initialState)
  const { boards, presets } = state
  const [activeId, setActiveId] = useState(() => state.boards[0].id)
  const [savedAt, setSavedAt] = useState(null)
  const [mode, setMode] = useState('editor')

  const activeIndex = boards.findIndex((b) => b.id === activeId)
  const activeBoard = boards[activeIndex] ?? boards[0]

  function updateBoard(updated) {
    setState((s) => ({ ...s, boards: s.boards.map((b) => (b.id === updated.id ? updated : b)) }))
  }

  function addBoard() {
    // Always appended, so never board 0 - it'll be pushed in as a wave once
    // an earlier board clears out (see CLAUDE.md's Play Tester section),
    // and waves are capped at 3 rows.
    const board = createBoard(`Board ${boards.length + 1}`, { rows: 3 })
    setState((s) => ({ ...s, boards: [...s.boards, board] }))
    setActiveId(board.id)
  }

  function duplicateBoard(id) {
    const board = boards.find((b) => b.id === id)
    const copy = cloneBoard(board)
    const idx = boards.findIndex((b) => b.id === id)
    setState((s) => ({ ...s, boards: [...s.boards.slice(0, idx + 1), copy, ...s.boards.slice(idx + 1)] }))
    setActiveId(copy.id)
  }

  function removeBoard(id) {
    if (boards.length <= 1) return
    setState((s) => ({ ...s, boards: s.boards.filter((b) => b.id !== id) }))
    if (activeId === id) {
      const remaining = boards.filter((b) => b.id !== id)
      setActiveId(remaining[0].id)
    }
  }

  function moveBoard(from, to) {
    if (to < 0 || to >= boards.length) return
    setState((s) => {
      const next = [...s.boards]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return { ...s, boards: next }
    })
  }

  function savePreset(preset) {
    setState((s) => ({ ...s, presets: [...s.presets, preset] }))
  }

  function handleSave() {
    saveState({ boards, presets })
    setSavedAt(new Date())
  }

  return (
    <div className="min-h-screen">
      <div className="app-backdrop" aria-hidden="true" />

      <header className="bg-white/80 backdrop-blur-md border-b border-white sticky top-0 z-30 shadow-sm shadow-purple-950/5">
        <div className="max-w-[1760px] mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-purple-600 to-fuchsia-500 text-white rounded-xl p-2 shadow-md shadow-purple-500/30">
              <Puzzle size={20} strokeWidth={2.25} />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 leading-tight tracking-tight">Merge Mania Board Simulator</h1>
              <p className="text-xs text-slate-400 leading-tight">Board layout &amp; item-placement design tool</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-100/80 rounded-xl p-1">
              {MODES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 ${
                    mode === id
                      ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-sm shadow-purple-500/30'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon size={14} strokeWidth={2.25} />
                  {label}
                </button>
              ))}
            </div>
            {savedAt && <span className="text-xs text-slate-400">Saved {savedAt.toLocaleTimeString()}</span>}
            <Button variant="dark" icon={Save} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1760px] mx-auto px-6 py-6 flex gap-8">
        <BoardList
          boards={boards}
          activeId={activeBoard?.id}
          onSelect={setActiveId}
          onAdd={addBoard}
          onDuplicate={duplicateBoard}
          onRemove={removeBoard}
          onMove={moveBoard}
        />
        {activeBoard && mode === 'editor' && (
          <BoardEditor
            key={activeBoard.id}
            board={activeBoard}
            boards={boards}
            boardIndex={activeIndex}
            isFirstBoard={activeIndex === 0}
            presets={presets}
            onChange={updateBoard}
            onSavePreset={savePreset}
          />
        )}
        {activeBoard && mode === 'play' && <PlayTester key={activeBoard.id} boards={boards} boardIndex={activeIndex} />}
      </main>
    </div>
  )
}

export default App
