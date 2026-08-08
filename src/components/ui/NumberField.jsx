import { useEffect, useState } from 'react'

// A plain controlled <input value={n} onChange={...}> fights the user the
// moment they clear it to type a replacement: an empty string parses to
// Number('') === 0, and callers fall that back to some default (Number(v) ||
// MIN_RANK, etc.), which round-trips straight back into `value` and snaps
// the field to that default before a new digit can be typed - clearing a "3"
// to type "12" instead shows "1" (the fallback), then "112" once "2" lands.
//
// Fixed by keeping the displayed text as local state, decoupled from the
// caller's numeric value: onChange is only forwarded while there's a real
// number to report, so an empty field just stays empty (the caller's value
// - and this field's fallback-on-empty logic - is untouched mid-edit) and
// only resolves to the caller's fallback on blur, once the user has
// actually finished editing.
export default function NumberField({ label, hint, value, onChange, onBlur, className = '', ...props }) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  function handleChange(e) {
    setText(e.target.value)
    if (e.target.value.trim() !== '') onChange?.(e)
  }

  function handleBlur(e) {
    if (text.trim() === '') onChange?.(e)
    onBlur?.(e)
  }

  return (
    <label className={`text-sm flex flex-col gap-1.5 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="number"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        className="border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-medium bg-white/70 focus:outline-none focus:ring-4 focus:ring-purple-200/60 focus:border-purple-400 transition-shadow"
        {...props}
      />
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  )
}
