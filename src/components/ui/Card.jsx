export default function Card({ title, subtitle, action, icon: Icon, className = '', children }) {
  return (
    <div
      className={`bg-white/90 backdrop-blur-sm border border-white shadow-lg shadow-purple-950/5 rounded-3xl ring-1 ring-slate-200/70 ${className}`}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-2.5 min-w-0">
            {Icon && (
              <span className="mt-0.5 shrink-0 grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-500 text-white shadow-sm">
                <Icon size={14} strokeWidth={2.5} />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="font-display text-[0.95rem] font-semibold tracking-tight text-slate-800 truncate">{title}</h2>}
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}
