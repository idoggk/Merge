import { useState } from 'react'
import { TIERS, makeParticles } from '../lib/mergeCelebration'

// Anchored inside a `relative` grid cell - renders a short-lived burst of
// emoji particles flying outward from the cell's center, then leaves nothing
// behind (the parent unmounts this after celebrationDuration(tier)).
export default function MergeCelebration({ tier }) {
  const [particles] = useState(() => makeParticles(tier))
  const { duration, sizeClass } = TIERS[tier]

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
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
    </div>
  )
}
