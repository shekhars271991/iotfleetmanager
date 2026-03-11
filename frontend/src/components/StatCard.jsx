const configs = {
  blue: {
    bg: 'bg-white',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    valueColor: 'text-slate-800',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
      </svg>
    ),
  },
  green: {
    bg: 'bg-white',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    valueColor: 'text-emerald-600',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  red: {
    bg: 'bg-white',
    iconBg: 'bg-red-50',
    iconColor: 'text-red-500',
    valueColor: 'text-red-600',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  amber: {
    bg: 'bg-white',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    valueColor: 'text-amber-600',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
  },
  slate: {
    bg: 'bg-white',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-400',
    valueColor: 'text-slate-500',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l1.664 1.664M21 21l-1.5-1.5m-5.533-1.967a3.75 3.75 0 0 1-5.3-5.3m5.3 5.3-5.3-5.3m5.3 5.3L12 17.25m-3.533-3.967L3 8.25m4.5 4.5 1.967-1.967" />
      </svg>
    ),
  },
}

export default function StatCard({ label, value, color = 'blue' }) {
  const cfg = configs[color] || configs.blue
  return (
    <div className={`${cfg.bg} rounded-xl border border-slate-200/80 shadow-sm p-5 flex items-start justify-between`}>
      <div>
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <p className={`text-3xl font-semibold mt-1 tracking-tight ${cfg.valueColor}`}>{value}</p>
      </div>
      <div className={`w-10 h-10 rounded-xl ${cfg.iconBg} ${cfg.iconColor} flex items-center justify-center`}>
        {cfg.icon}
      </div>
    </div>
  )
}
