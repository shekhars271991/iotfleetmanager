import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'

const METRIC_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-cyan-500', 'bg-orange-500',
  'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-indigo-500',
]

const SEVERITY_CFG = {
  critical: { color: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-200' },
  warning: { color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-200' },
  info: { color: 'bg-blue-400', text: 'text-blue-700', bg: 'bg-blue-50', ring: 'ring-blue-200' },
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/api/dashboard/stats'),
      api.get('/api/alerts'),
    ]).then(([statsRes, alertsRes]) => {
      setStats(statsRes.data)
      setAlerts(alertsRes.data.slice(0, 6))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleAck = async (id) => {
    try {
      await api.put(`/api/alerts/${id}/acknowledge`)
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a))
    } catch {}
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="grid grid-cols-5 gap-4">{[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-xl" />)}</div>
          <div className="grid grid-cols-3 gap-6">{[...Array(3)].map((_, i) => <div key={i} className="h-64 bg-slate-200 rounded-xl" />)}</div>
        </div>
      </div>
    )
  }

  const s = stats || {}
  const onlinePct = s.total ? Math.round((s.online / s.total) * 100) : 0
  const alertsSummary = s.alerts_summary || {}
  const invSummary = s.investigations_summary || {}
  const bySev = alertsSummary.by_severity || {}
  const maxSev = Math.max(...Object.values(bySev), 1)
  const maxType = s.by_type ? Math.max(...Object.values(s.by_type), 1) : 1

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">Fleet overview and system health</p>
        </div>
        <div className="text-[11px] text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg font-medium">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MiniStat label="Total Devices" value={s.total || 0} icon={<DeviceIcon />} color="blue" />
        <MiniStat label="Online" value={s.online || 0} icon={<OnlineIcon />} color="emerald" />
        <MiniStat label="Offline" value={s.offline || 0} icon={<OfflineIcon />} color="red" />
        <MiniStat label="Unack. Alerts" value={alertsSummary.unacknowledged || 0} icon={<AlertIcon />} color="amber" link="/alerts" />
        <MiniStat label="Investigations" value={invSummary.total || 0} icon={<InvIcon />} color="violet" sub={invSummary.running ? `${invSummary.running} running` : null} />
      </div>

      {/* Row 2: Status + Alert Severity + Metric Types */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fleet Health */}
        <Panel title="Fleet Health">
          <div className="flex items-center gap-6">
            {/* Donut */}
            <div className="relative w-28 h-28 shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#f1f5f9" strokeWidth="3.5" />
                {s.total > 0 && <>
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#10b981" strokeWidth="3.5"
                    strokeDasharray={`${(s.online / s.total) * 88} 88`} strokeDashoffset="0" strokeLinecap="round" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#ef4444" strokeWidth="3.5"
                    strokeDasharray={`${(s.offline / s.total) * 88} 88`} strokeDashoffset={`${-(s.online / s.total) * 88}`} strokeLinecap="round" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#f59e0b" strokeWidth="3.5"
                    strokeDasharray={`${(s.warning / s.total) * 88} 88`} strokeDashoffset={`${-((s.online + s.offline) / s.total) * 88}`} strokeLinecap="round" />
                </>}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-slate-800">{onlinePct}%</span>
                <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Healthy</span>
              </div>
            </div>
            {/* Legend */}
            <div className="flex-1 space-y-2.5">
              <LegendRow label="Online" count={s.online || 0} total={s.total} color="bg-emerald-500" />
              <LegendRow label="Offline" count={s.offline || 0} total={s.total} color="bg-red-500" />
              <LegendRow label="Warning" count={s.warning || 0} total={s.total} color="bg-amber-500" />
              <LegendRow label="Decommissioned" count={s.decommissioned || 0} total={s.total} color="bg-slate-300" />
            </div>
          </div>
        </Panel>

        {/* Alert Severity */}
        <Panel title="Alerts by Severity" action={<Link to="/alerts" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View All</Link>}>
          {Object.keys(bySev).length > 0 ? (
            <div className="space-y-3">
              {['critical', 'warning', 'info'].filter(sev => bySev[sev]).map(sev => {
                const cfg = SEVERITY_CFG[sev] || SEVERITY_CFG.info
                const count = bySev[sev] || 0
                return (
                  <div key={sev} className="flex items-center gap-3">
                    <span className={`text-[11px] font-semibold uppercase w-16 ${cfg.text}`}>{sev}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-3">
                      <div className={`h-3 rounded-full ${cfg.color} transition-all`} style={{ width: `${Math.round((count / maxSev) * 100)}%` }} />
                    </div>
                    <span className="text-[13px] font-bold text-slate-700 w-8 text-right">{count}</span>
                  </div>
                )
              })}
              <div className="pt-2 border-t border-slate-100 flex justify-between text-[12px]">
                <span className="text-slate-500">Total: <span className="font-semibold text-slate-700">{alertsSummary.total || 0}</span></span>
                <span className="text-amber-600 font-medium">{alertsSummary.unacknowledged || 0} unacknowledged</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-6"><p className="text-[13px] text-slate-400">No alerts recorded</p></div>
          )}
        </Panel>

        {/* Device Types */}
        <Panel title="Device Types">
          <div className="space-y-3">
            {s.by_type && Object.entries(s.by_type).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
              const pct = Math.round((count / maxType) * 100)
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-medium text-slate-700 capitalize">{type}</span>
                    <span className="text-[13px] font-semibold text-slate-800">{count}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      {/* Row 3: Investigations + Rules/Simulations + Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Investigations */}
        <Panel title="AI Investigations" action={<Link to="/alerts" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View All</Link>}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatTile label="Completed" value={invSummary.completed || 0} color="emerald" />
            <StatTile label="Running" value={invSummary.running || 0} color="blue" />
            <StatTile label="Failed" value={invSummary.failed || 0} color="red" />
            <StatTile label="Total" value={invSummary.total || 0} color="slate" />
          </div>
          {invSummary.total > 0 && (
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Success rate</span>
                <div className="flex-1 bg-slate-200 rounded-full h-2">
                  <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round(((invSummary.completed || 0) / invSummary.total) * 100)}%` }} />
                </div>
                <span className="text-[12px] font-semibold text-slate-700">{Math.round(((invSummary.completed || 0) / invSummary.total) * 100)}%</span>
              </div>
            </div>
          )}
        </Panel>

        {/* Metric Types + System Counts */}
        <Panel title="Sensor Metrics">
          {s.by_metric_type && Object.keys(s.by_metric_type).length > 0 ? (
            <div className="space-y-2.5">
              {Object.entries(s.by_metric_type).sort((a, b) => b[1] - a[1]).map(([mt, count], i) => (
                <div key={mt} className="flex items-center gap-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${METRIC_COLORS[i % METRIC_COLORS.length]}`} />
                  <span className="text-[13px] text-slate-700 capitalize flex-1">{mt}</span>
                  <span className="text-[13px] font-semibold text-slate-800">{count}</span>
                </div>
              ))}
              <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-3">
                <div className="bg-violet-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-[16px] font-bold text-violet-700">{s.active_rules}</p>
                  <p className="text-[10px] text-violet-500 font-medium uppercase tracking-wider">Active Rules</p>
                </div>
                <div className="bg-cyan-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-[16px] font-bold text-cyan-700">{s.active_simulations}</p>
                  <p className="text-[10px] text-cyan-500 font-medium uppercase tracking-wider">Simulations</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6"><p className="text-[13px] text-slate-400">No metric types configured</p></div>
          )}
        </Panel>

        {/* Recent Alerts */}
        <Panel title="Recent Alerts" action={<Link to="/alerts" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View All</Link>}>
          {alerts.length > 0 ? (
            <div className="space-y-2">
              {alerts.map(a => {
                const cfg = SEVERITY_CFG[a.severity] || SEVERITY_CFG.info
                return (
                  <div key={a.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${a.acknowledged ? 'bg-white border-slate-100' : `${cfg.bg} ${cfg.ring} border`}`}>
                    <span className={`w-2 h-2 rounded-full ${cfg.color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-medium truncate ${a.acknowledged ? 'text-slate-400' : 'text-slate-700'}`}>{a.message}</p>
                      <p className="text-[10px] text-slate-400">{a.created_at ? timeAgo(a.created_at) : ''}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>{a.severity}</span>
                    {!a.acknowledged && (
                      <button onClick={() => handleAck(a.id)} className="text-[10px] text-slate-400 hover:text-slate-600 border border-slate-200 rounded px-1.5 py-0.5 hover:bg-slate-50 transition shrink-0">Ack</button>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-6"><p className="text-[13px] text-slate-400">No alerts</p></div>
          )}
        </Panel>
      </div>

      {/* Group Health */}
      {s.groups?.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-800">Group Health</h3>
            <Link to="/groups" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">All Groups</Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {s.groups.map(group => {
              const healthPct = group.total ? Math.round((group.online / group.total) * 100) : 0
              return (
                <Link to={`/groups/${group.id}`} key={group.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 hover:shadow-md hover:border-indigo-200 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[13px] font-semibold text-slate-800 truncate">{group.name}</h4>
                    <span className="text-[11px] text-slate-400">{group.total} devices</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 mb-3">
                    <div className="h-2 rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${healthPct}%` }} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-slate-500">{group.online} online</span></span>
                    {group.offline > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-slate-500">{group.offline} offline</span></span>}
                    {group.warning > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /><span className="text-slate-500">{group.warning} warn</span></span>}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}


function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function Panel({ title, action, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function LegendRow({ label, count, total, color }) {
  const pct = total ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2.5">
      <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
      <span className="text-[12px] text-slate-600 flex-1">{label}</span>
      <span className="text-[12px] font-semibold text-slate-700">{count}</span>
      <span className="text-[10px] text-slate-400 w-8 text-right">{pct}%</span>
    </div>
  )
}

function StatTile({ label, value, color }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-50 text-slate-700',
  }
  const c = colors[color] || colors.slate
  return (
    <div className={`rounded-lg px-3 py-2.5 text-center ${c}`}>
      <p className="text-[18px] font-bold">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</p>
    </div>
  )
}

function MiniStat({ label, value, icon, color, sub, link }) {
  const colors = {
    blue: { iconBg: 'bg-blue-50', iconText: 'text-blue-600', value: 'text-slate-800' },
    emerald: { iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', value: 'text-emerald-600' },
    red: { iconBg: 'bg-red-50', iconText: 'text-red-500', value: 'text-red-600' },
    amber: { iconBg: 'bg-amber-50', iconText: 'text-amber-500', value: 'text-amber-600' },
    violet: { iconBg: 'bg-violet-50', iconText: 'text-violet-500', value: 'text-violet-600' },
  }
  const c = colors[color] || colors.blue
  const Wrapper = link ? Link : 'div'
  const wrapperProps = link ? { to: link } : {}

  return (
    <Wrapper {...wrapperProps} className={`bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 flex items-start justify-between ${link ? 'hover:shadow-md hover:border-indigo-200 transition-all' : ''}`}>
      <div>
        <p className="text-[12px] font-medium text-slate-500">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 tracking-tight ${c.value}`}>{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`w-9 h-9 rounded-lg ${c.iconBg} ${c.iconText} flex items-center justify-center`}>{icon}</div>
    </Wrapper>
  )
}

function DeviceIcon() {
  return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" /></svg>
}
function OnlineIcon() {
  return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
}
function OfflineIcon() {
  return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
}
function AlertIcon() {
  return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>
}
function InvIcon() {
  return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" /></svg>
}
