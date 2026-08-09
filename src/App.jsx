import { useState } from 'react'
import { Save, Puzzle, LayoutGrid, Gamepad2, Boxes, FileCode2, Share2, Check, TriangleAlert } from 'lucide-react'
import BoardList from './components/BoardList'
import BoardEditor from './components/BoardEditor'
import PlayTester from './components/PlayTester'
import CCManagement from './components/CCManagement'
import SyntaxPage from './components/SyntaxPage'
import PlayStage from './components/PlayStage'
import Button from './components/ui/Button'
import { createBoard, cloneBoard } from './lib/board'
import { loadState, saveState } from './lib/persistence'
import { DEFAULT_TARGET_EV } from './lib/luckyDrop'
import { encodeStage, decodeStage, MAX_SAFE_STAGE_CHARS } from './lib/stageShare'
import { createDefaultStage } from './data/defaultStage'

// "Share stage" always targets this, never window.location.href - see
// handleShare's comment for why.
const PRODUCTION_ORIGIN = 'https://idoggk.github.io/Merge/'

const MODES = [
  { id: 'editor', label: 'Editor', icon: LayoutGrid },
  { id: 'play', label: 'Play tester', icon: Gamepad2 },
  { id: 'cc', label: 'CC management', icon: Boxes },
  { id: 'syntax', label: 'Syntax', icon: FileCode2 },
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
        targetEv: DEFAULT_TARGET_EV,
        rewardRanks: [],
        ...b,
      })),
      targetSubsidy: persisted.targetSubsidy ?? null,
    }
  }
  const first = createBoard('Board 1')
  return { boards: [first], presets: [], targetSubsidy: null }
}

// A shared stage link (?play, optionally &stage=<encoded boards> — see
// stageShare.js) renders the stripped-down player view instead of the
// economist app entirely, so a friend opening the link never sees the
// editor/CC-management/syntax tooling. No stage param falls back to the
// baked-in defaultStage.js demo, so a bare "?play" link is still meaningful.
//
// A stage param that's PRESENT but fails to decode (cut off by a chat app,
// mangled by copy-paste, etc. - see stageShare.js/CLAUDE.md for the CDN
// URL-length ceiling this is guarding against) is deliberately NOT treated
// the same as "no stage param at all" - silently substituting the default
// demo there would look identical to "nothing went wrong," which is exactly
// what made this bug hard to diagnose from a bug report alone. `linkBroken`
// surfaces it instead.
function PlayApp() {
  const [{ boards, linkBroken }] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const stageParam = params.get('stage')
    if (!stageParam) return { boards: createDefaultStage().boards, linkBroken: false }
    const decoded = decodeStage(stageParam)
    return decoded ? { boards: decoded, linkBroken: false } : { boards: createDefaultStage().boards, linkBroken: true }
  })

  return (
    <div className="min-h-screen">
      <div className="app-backdrop" aria-hidden="true" />
      <main className="max-w-[1760px] mx-auto px-3 py-4 sm:px-6 sm:py-10 play-compact-py">
        {linkBroken && (
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 max-w-4xl mx-auto">
            <TriangleAlert size={16} className="shrink-0 mt-0.5" />
            <span className="text-sm">
              This share link looks broken or got cut off along the way, so we're showing the demo stage instead —
              ask whoever sent it to re-share the link.
            </span>
          </div>
        )}
        <PlayStage boards={boards} />
      </main>
    </div>
  )
}

function EditorApp() {
  const [state, setState] = useState(initialState)
  const { boards, presets, targetSubsidy } = state
  const [activeId, setActiveId] = useState(() => state.boards[0].id)
  const [savedAt, setSavedAt] = useState(null)
  const [mode, setMode] = useState('editor')
  const [shareCopied, setShareCopied] = useState(false)
  const [shareWarning, setShareWarning] = useState(null)

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

  // Bulk add/remove from the end to reach `count` - same never-touch-board-0
  // rule as addBoard/removeBoard, just applied N times at once from the
  // Total Subsidy card instead of one board at a time from the sidebar.
  function setBoardCount(count) {
    const target = Math.max(1, count)
    if (target === boards.length) return
    if (target > boards.length) {
      const additions = Array.from({ length: target - boards.length }, (_, i) =>
        createBoard(`Board ${boards.length + i + 1}`, { rows: 3 }),
      )
      setState((s) => ({ ...s, boards: [...s.boards, ...additions] }))
      return
    }
    const next = boards.slice(0, target)
    setState((s) => ({ ...s, boards: next }))
    if (!next.some((b) => b.id === activeId)) setActiveId(next[0].id)
  }

  function savePreset(preset) {
    setState((s) => ({ ...s, presets: [...s.presets, preset] }))
  }

  function updateTargetSubsidy(value) {
    setState((s) => ({ ...s, targetSubsidy: value }))
  }

  function handleSave() {
    saveState({ boards, presets, targetSubsidy })
    setSavedAt(new Date())
  }

  // Encodes the current board list into the URL and copies a shareable
  // player link - the recipient's browser never touches this app's
  // localStorage, so the boards have to travel in the link itself. Still
  // copies the link even when it's long (the economist's call whether to
  // send it anyway) - MAX_SAFE_STAGE_CHARS is a warning threshold, not a
  // hard block, since we can't know the recipient's actual network/client
  // ahead of time.
  //
  // Always targets PRODUCTION_ORIGIN, NEVER window.location.href - found
  // live: this app is naturally designed/tinkered with via `npm run dev`
  // (localhost), and a plain window.location.href-based link would silently
  // copy a `localhost:5173/...` URL there - which looks completely normal
  // to the person who copied it (it's still just a link) but can never work
  // for literally anyone else, since "localhost" means "whichever machine
  // opens this" on every computer, not "the sender's machine." The stage
  // data itself is fully self-contained in the URL regardless of origin, so
  // hardcoding the real deployed host costs nothing and removes an entire
  // class of "it works for me but not for them" reports.
  async function handleShare() {
    const encoded = encodeStage(boards)
    const fullUrl = `${PRODUCTION_ORIGIN}?play&stage=${encoded}`
    await navigator.clipboard.writeText(fullUrl)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
    setShareWarning(
      fullUrl.length > MAX_SAFE_STAGE_CHARS
        ? `Heads up: this link is long (${boards.length} boards) - some chat apps, email clients, or corporate networks may fail to open it for your recipient. If it doesn't open, try trimming boards.`
        : null,
    )
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
            <Button variant="secondary" icon={shareCopied ? Check : Share2} onClick={handleShare}>
              {shareCopied ? 'Link copied!' : 'Share stage'}
            </Button>
            <Button variant="dark" icon={Save} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </header>

      {shareWarning && (
        <div className="max-w-[1760px] mx-auto px-6 pt-4">
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
            <TriangleAlert size={16} className="shrink-0 mt-0.5" />
            <span className="text-sm flex-1">{shareWarning}</span>
            <button
              type="button"
              onClick={() => setShareWarning(null)}
              className="text-amber-600 hover:text-amber-800 text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="max-w-[1760px] mx-auto px-6 py-6 flex gap-8">
        <BoardList
          boards={boards}
          activeId={activeBoard?.id}
          onSelect={setActiveId}
          onAdd={addBoard}
          onDuplicate={duplicateBoard}
          onRemove={removeBoard}
          onMove={moveBoard}
          onUpdateBoard={updateBoard}
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
            onUpdateBoard={updateBoard}
            onSavePreset={savePreset}
            targetSubsidy={targetSubsidy}
            onUpdateTargetSubsidy={updateTargetSubsidy}
            onSetBoardCount={setBoardCount}
          />
        )}
        {activeBoard && mode === 'play' && <PlayTester key={activeBoard.id} boards={boards} boardIndex={activeIndex} />}
        {mode === 'cc' && <CCManagement boards={boards} />}
        {mode === 'syntax' && <SyntaxPage boards={boards} />}
      </main>
    </div>
  )
}

function App() {
  const isPlayLink = new URLSearchParams(window.location.search).has('play')
  return isPlayLink ? <PlayApp /> : <EditorApp />
}

export default App
