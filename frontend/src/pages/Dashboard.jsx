import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import StatCard from '../components/StatCard'
import AlertList from '../components/AlertList'

const TYPE_COLORS = {
  sensor: { bar: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50' },
  gateway: { bar: 'bg-violet-500', text: 'text-violet-600', bg: 'bg-violet-50' },
  actuator: { bar: 'bg-cyan-500', text: 'text-cyan-600', bg: 'bg-cyan-50' },
  camera: { bar: 'bg-orange-500', text: 'text-orange-600', bg: 'bg-orange-50' },
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
      setAlerts(alertsRes.data.slice(0, 5))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleAcknowledge = async (alertId) => {
    await api.put(`/api/alerts/${alertId}/acknowledge`)
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a))
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => <div key={i} className="h-64 bg-slate-200 rounded-xl" />)}
          </div>
        </div>
      </div>
    )
  }

  const onlinePct = stats?.total ? Math.round((stats.online / stats.total) * 100) : 0
  const offlinePct = stats?.total ? Math.round((stats.offline / stats.total) * 100) : 0
  const warningPct = stats?.total ? Math.round((stats.warning / stats.total) * 100) : 0
  const maxType = stats?.by_type ? Math.max(...Object.values(stats.by_type), 1) : 1

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">Fleet overview and system health</p>
        </div>
        <div className="text-[11px] text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg font-medium">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Total Devices" value={stats.total} color="blue" />
          <StatCard label="Online" value={stats.online} color="green" />
          <StatCard label="Offline" value={stats.offline} color="red" />
          <StatCard label="Warning" value={stats.warning} color="amber" />
          <StatCard label="Decommissioned" value={stats.decommissioned || 0} color="slate" />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <Panel title="Status Distribution">
          <div className="space-y-4 pt-1">
            <StatusBar label="Online" count={stats?.online || 0} total={stats?.total || 1} pct={onlinePct} color="bg-emerald-500" />
            <StatusBar label="Offline" count={stats?.offline || 0} total={stats?.total || 1} pct={offlinePct} color="bg-red-500" />
            <StatusBar label="Warning" count={stats?.warning || 0} total={stats?.total || 1} pct={warningPct} color="bg-amber-500" />
          </div>
          {/* Donut */}
          <div className="flex items-center justify-center mt-6">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#f1f5f9" strokeWidth="4" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="#10b981" strokeWidth="4"
                  strokeDasharray={`${onlinePct * 0.88} 88`} strokeDashoffset="0" strokeLinecap="round" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="#ef4444" strokeWidth="4"
                  strokeDasharray={`${offlinePct * 0.88} 88`} strokeDashoffset={`${-onlinePct * 0.88}`} strokeLinecap="round" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="#f59e0b" strokeWidth="4"
                  strokeDasharray={`${warningPct * 0.88} 88`} strokeDashoffset={`${-(onlinePct + offlinePct) * 0.88}`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold text-slate-800">{onlinePct}%</span>
                <span className="text-[10px] text-slate-400 font-medium">Healthy</span>
              </div>
            </div>
          </div>
        </Panel>

        {/* Device Type Breakdown */}
        <Panel title="Device Types">
          <div className="space-y-3 pt-1">
            {stats?.by_type && Object.entries(stats.by_type).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
              const cfg = TYPE_COLORS[type] || TYPE_COLORS.sensor
              const pct = Math.round((count / maxType) * 100)
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-md ${cfg.bg} ${cfg.text} flex items-center justify-center`}>
                        <TypeIcon type={type} />
                      </span>
                      <span className="text-[13px] font-medium text-slate-700 capitalize">{type}</span>
                    </div>
                    <span className="text-[13px] font-semibold text-slate-800">{count}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${cfg.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        {/* Recent Alerts */}
        <Panel
          title="Recent Alerts"
          action={
            <Link to="/alerts" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              View All
            </Link>
          }
        >
          <AlertList alerts={alerts} onAcknowledge={handleAcknowledge} />
        </Panel>
      </div>

      {/* Group Health Row */}
      {stats?.groups?.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-800">Group Health</h3>
            <Link to="/groups" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">All Groups</Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.groups.map(group => {
              const healthPct = group.total ? Math.round((group.online / group.total) * 100) : 0
              return (
                <div key={group.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[13px] font-semibold text-slate-800 truncate">{group.name}</h4>
                    <span className="text-[11px] text-slate-400">{group.total} devices</span>
                  </div>
                  {/* Mini health bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2 mb-3">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${healthPct}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-slate-500">{group.online} online</span>
                    </span>
                    {group.offline > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span className="text-slate-500">{group.offline} offline</span>
                      </span>
                    )}
                    {group.warning > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <span className="text-slate-500">{group.warning} warn</span>
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Panel({ title, action, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {action}
      </div>
      <div className="px-5 py-4">
        {children}
      </div>
    </div>
  )
}

function StatusBar({ label, count, total, pct, color }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] text-slate-600">{label}</span>
        <span className="text-[13px] font-semibold text-slate-800">{count}<span className="text-slate-400 font-normal"> / {total}</span></span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function TypeIcon({ type }) {
  const cls = "w-3.5 h-3.5"
  switch (type) {
    case 'sensor':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
    case 'gateway':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" /></svg>
    case 'actuator':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" /></svg>
    case 'camera':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
    default:
      return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75l-5.571-3m11.142 0L21.75 12l-4.179 2.25m0 0L12 17.25l-5.571-3m0 0L2.25 16.5 12 21.75l9.75-5.25-4.179-2.25" /></svg>
  }
}
