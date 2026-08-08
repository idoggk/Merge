const VARIANTS = {
  primary:
    'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md shadow-purple-500/25 hover:from-purple-500 hover:to-fuchsia-500 hover:shadow-lg hover:shadow-purple-500/30',
  dark: 'bg-slate-900 text-white shadow-sm hover:bg-slate-800',
  secondary: 'bg-white text-slate-700 border border-slate-200 shadow-sm hover:border-purple-200 hover:bg-purple-50/60',
  ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
  danger: 'text-slate-400 hover:bg-red-50 hover:text-red-600',
}

const SIZES = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-3.5 py-2.5 gap-2',
}

export default function Button({ variant = 'secondary', size = 'md', icon: Icon, className = '', children, ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2.25} />}
      {children}
    </button>
  )
}
