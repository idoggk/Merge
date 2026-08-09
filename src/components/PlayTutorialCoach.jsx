import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

const PAD = 8
const ARROW_SIZE = 28
const GAP = ARROW_SIZE + 10 // room for the bouncing arrow between spot and tooltip, plus a small margin
const TOOLTIP_WIDTH = 280

// A first-time-play walkthrough: dims everything except one or two real DOM
// elements (found via `selectors`, e.g. the generator button or a specific
// board tile), with a callout + bouncing arrow pointing at them. Positions
// itself against the viewport (not the page), re-measuring on an interval
// rather than wiring a ResizeObserver to every possible layout-shift source
// (celebrations popping in, responsive breakpoint changes, etc.) - simple
// and cheap at this scale.
//
// The four dimmed panels (top/bottom/left/right of the spotlight) are the
// actual click-blockers - there's no single-div trick that both dims
// everywhere except a rect AND lets clicks through only in that rect, so
// this is genuinely four separate elements, not a box-shadow shortcut. The
// spotlight ring itself and the tooltip are pointer-events-none/auto
// respectively so the real target underneath stays clickable and the
// tooltip's own buttons still work.
export default function PlayTutorialCoach({ selectors, text, final, onSkip, onDone }) {
  const [rects, setRects] = useState(null)

  useEffect(() => {
    // On a short viewport (a landscape phone especially - see CLAUDE.md's
    // "Phone/landscape support") the target can start out below the fold.
    // Scroll it into view once when this step first activates, then leave
    // scrolling alone so it doesn't fight the player's own scrolling.
    let scrolledIntoView = false

    function measure() {
      const found = selectors.map((sel) => document.querySelector(sel)).filter(Boolean)
      if (found.length === 0) {
        setRects(null)
        return
      }
      const newRects = found.map((el) => el.getBoundingClientRect())
      setRects(newRects)
      if (!scrolledIntoView) {
        const offscreen = newRects.some((r) => r.top < 0 || r.bottom > window.innerHeight)
        if (offscreen) found[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
        scrolledIntoView = true
      }
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    const interval = setInterval(measure, 250)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      clearInterval(interval)
    }
  }, [selectors])

  if (!rects) return null

  const union = rects.reduce(
    (acc, r) => ({
      top: Math.min(acc.top, r.top),
      left: Math.min(acc.left, r.left),
      right: Math.max(acc.right, r.right),
      bottom: Math.max(acc.bottom, r.bottom),
    }),
    { top: Infinity, left: Infinity, right: -Infinity, bottom: -Infinity },
  )
  const spot = {
    top: Math.max(union.top - PAD, 0),
    left: Math.max(union.left - PAD, 0),
    right: Math.min(union.right + PAD, window.innerWidth),
    bottom: Math.min(union.bottom + PAD, window.innerHeight),
  }
  const spotWidth = spot.right - spot.left
  const spotHeight = spot.bottom - spot.top

  const vh = window.innerHeight
  const vw = window.innerWidth
  const roomBelow = vh - spot.bottom
  const placeBelow = roomBelow > 150 || spot.top < 150
  const tooltipLeft = Math.min(Math.max(spot.left + spotWidth / 2 - TOOLTIP_WIDTH / 2, 12), vw - TOOLTIP_WIDTH - 12)

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" role="dialog" aria-live="polite">
      {/* The outer shell is pointer-events-none so it never captures clicks
          over the "hole" just because it's a full-viewport box - only the
          four dimming panels and the tooltip (both explicitly pointer-events-
          auto below) should actually intercept anything. */}
      <div className="absolute bg-slate-950/65 pointer-events-auto" style={{ top: 0, left: 0, right: 0, height: spot.top }} />
      <div className="absolute bg-slate-950/65 pointer-events-auto" style={{ top: spot.bottom, left: 0, right: 0, bottom: 0 }} />
      <div className="absolute bg-slate-950/65 pointer-events-auto" style={{ top: spot.top, left: 0, width: spot.left, height: spotHeight }} />
      <div className="absolute bg-slate-950/65 pointer-events-auto" style={{ top: spot.top, left: spot.right, right: 0, height: spotHeight }} />

      <div
        className="absolute rounded-2xl ring-4 ring-fuchsia-400 shadow-[0_0_20px_rgba(232,121,249,0.6)] pointer-events-none animate-pulse"
        style={{ top: spot.top, left: spot.left, width: spotWidth, height: spotHeight }}
      />

      <div
        className="absolute flex flex-col gap-3 rounded-2xl bg-white shadow-xl p-4 pointer-events-auto"
        style={{
          width: TOOLTIP_WIDTH,
          maxWidth: 'calc(100vw - 24px)',
          left: tooltipLeft,
          ...(placeBelow ? { top: spot.bottom + GAP } : { bottom: vh - spot.top + GAP }),
        }}
      >
        <p className="text-sm text-slate-700 leading-snug">{text}</p>
        <div className="flex items-center justify-between">
          <button type="button" onClick={onSkip} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
            Skip tutorial
          </button>
          {final && (
            <button
              type="button"
              onClick={onDone}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-sm"
            >
              Got it!
            </button>
          )}
        </div>
      </div>

      {/* Rendered last so it always stacks above the tooltip if the gap is
          ever tight (e.g. a very short viewport) - GAP already reserves
          enough room that this is belt-and-suspenders, not load-bearing. */}
      {placeBelow ? (
        <ChevronUp
          size={ARROW_SIZE}
          className="absolute text-fuchsia-300 animate-bounce"
          style={{ top: spot.bottom + 2, left: spot.left + spotWidth / 2 - ARROW_SIZE / 2 }}
        />
      ) : (
        <ChevronDown
          size={ARROW_SIZE}
          className="absolute text-fuchsia-300 animate-bounce"
          style={{ top: spot.top - ARROW_SIZE - 2, left: spot.left + spotWidth / 2 - ARROW_SIZE / 2 }}
        />
      )}
    </div>
  )
}
