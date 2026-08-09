import { useState } from 'react'
import { TIERS, makeParticles } from '../lib/mergeCelebration'

// Same particle burst as MergeCelebration, plus a "LUCKY +N!" badge - a
// generator lucky drop is a distinct moment from a merge (it's the RNG
// rewarding the player, not something they did), so it gets its own visual
// language layered on the same underlying mechanics rather than reusing
// MergeCelebration's look as-is.
export default function LuckyDropCelebration({ tier, bonus }) {
  const [particles] = useState(() => makeParticles(tier))
  const { duration, sizeClass } = TIERS[tier]

  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {particles.map((p) => (
        <span
          key={p.key}
          className={`absolute left-1/2 top-1/2 ${sizeClass} select-none`}
          style={{
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            '--rot': `${p.rot}deg`,
            animation: `merge-particle ${duration}ms ease-out ${p.delay}ms forwards`,
          }}
        >
          {p.emoji}
        </span>
      ))}
      <span
        className="absolute left-1/2 top-1/2 whitespace-nowrap font-display font-extrabold text-amber-400 drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]"
        style={{
          fontSize: tier === 'big' ? '1.15rem' : '0.95rem',
          animation: `lucky-pop ${duration}ms ease-out forwards`,
        }}
      >
        ✨ LUCKY +{bonus}!
      </span>
    </div>
  )
}
