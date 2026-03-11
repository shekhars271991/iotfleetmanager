import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../api/client'
import StatusBadge from '../components/StatusBadge'
import RulesPanel from '../components/RulesPanel'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function shortId(id) {
  return id ? id.substring(0, 8) : ''
}

const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-colors'

function windowLabel(secs) {
  if (secs < 3600) return `${secs / 60}m`
  if (secs < 86400) return `${secs / 3600}h`
  return `${secs / 86400}d`
}

const METRIC_LABELS = {
  temp: 'Temperature', humidity: 'Humidity', battery_pct: 'Battery', cpu_usage: 'CPU Usage',
  mem_usage: 'Memory', uplink_kbps: 'Uplink', position: 'Position', power_on: 'Power',
  fps: 'FPS', storage_pct: 'Storage', pressure: 'Pressure', noise_db: 'Noise',
  vibration: 'Vibration', lux: 'Light', unassigned: 'Unassigned',
}

const METRIC_COLORS = {
  temp: 'bg-orange-50 text-orange-700 border-orange-100',
  humidity: 'bg-blue-50 text-blue-700 border-blue-100',
  battery_pct: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  cpu_usage: 'bg-violet-50 text-violet-700 border-violet-100',
  mem_usage: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  uplink_kbps: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  pressure: 'bg-sky-50 text-sky-700 border-sky-100',
  noise_db: 'bg-pink-50 text-pink-700 border-pink-100',
  vibration: 'bg-red-50 text-red-700 border-red-100',
  lux: 'bg-yellow-50 text-yellow-700 border-yellow-100',
  unassigned: 'bg-slate-50 text-slate-500 border-slate-200',
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
  )},
  { id: 'devices', label: 'Devices', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" /></svg>
  )},
  { id: 'aggregations', label: 'Aggregations', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
  )},
  { id: 'rules', label: 'Alert Rules', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
  )},
]

export default function GroupDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', description: '' })
  const [activeTab, setActiveTab] = useState('overview')

  const [aggMeta, setAggMeta] = useState(null)
  const [aggJobs, setAggJobs] = useState([])
  const [aggResults, setAggResults] = useState([])
  const [showAggForm, setShowAggForm] = useState(false)
  const [aggForm, setAggForm] = useState({ metric: '', function: 'avg', level: 'group', window_secs: 3600, name: '' })
  const [aggCreating, setAggCreating] = useState(false)

  const fetchData = () => {
    Promise.all([
      api.get('/api/groups'),
      api.get('/api/devices'),
      api.get(`/api/groups/${id}/aggregations`),
      api.get(`/api/groups/${id}/aggregations/results`),
      api.get('/api/aggregations/meta'),
    ]).then(([grpRes, devRes, aggRes, aggResultRes, metaRes]) => {
      const found = grpRes.data.find(g => g.id === id)
      setGroup(found || null)
      if (found) setEditForm({ name: found.name, description: found.description || '' })
      setDevices(devRes.data.filter(d => d.group_id === id))
      setAggJobs(aggRes.data)
      setAggResults(aggResultRes.data)
      setAggMeta(metaRes.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [id])

  useEffect(() => {
    const poll = setInterval(() => {
      api.get(`/api/groups/${id}/aggregations`).then(r => setAggJobs(r.data)).catch(() => {})
      api.get(`/api/groups/${id}/aggregations/results`).then(r => setAggResults(r.data)).catch(() => {})
    }, 15000)
    return () => clearInterval(poll)
  }, [id])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!editForm.name.trim()) return
    const res = await api.put(`/api/groups/${id}`, editForm)
    setGroup(res.data)
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!confirm('Delete this group? Devices will be unassigned.')) return
    await api.delete(`/api/groups/${id}`)
    navigate('/groups')
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-slate-200 rounded" />
          <div className="h-12 bg-slate-100 rounded-xl" />
          <div className="h-64 bg-slate-100 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!group) return <div className="p-8"><p className="text-red-500">Group not found</p></div>

  const activeDevices = devices.filter(d => d.status !== 'decommissioned')
  const decommissionedDevices = devices.filter(d => d.status === 'decommissioned')
  const online = activeDevices.filter(d => d.status === 'online').length
  const offline = activeDevices.filter(d => d.status === 'offline').length
  const warning = activeDevices.filter(d => d.status === 'warning').length
  const healthPct = activeDevices.length ? Math.round((online / activeDevices.length) * 100) : 0

  return (
    <div className="p-8 space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/groups')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </button>
          <div>
            <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">{group.name}</h2>
            {group.description && <p className="text-sm text-slate-500 mt-0.5">{group.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditing(!editing); setActiveTab('overview'); setEditForm({ name: group.name, description: group.description || '' }) }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all shadow-sm ${editing ? 'bg-white text-slate-600 border border-slate-200' : 'bg-indigo-600 text-white shadow-indigo-500/20 hover:bg-indigo-700'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={handleDelete} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-white text-red-500 border border-slate-200 hover:bg-red-50 hover:border-red-200 transition-all shadow-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
            Delete
          </button>
        </div>
      </div>

      {/* Tabbed Content */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
        <nav className="flex border-b border-slate-100 px-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-all -mb-px ${
                activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'devices' && (
                <span className="ml-1 text-[10px] font-bold bg-slate-200 text-slate-600 rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{devices.length}</span>
              )}
              {tab.id === 'aggregations' && aggJobs.length > 0 && (
                <span className="ml-1 text-[10px] font-bold bg-slate-200 text-slate-600 rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{aggJobs.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-5">
          {/* ===== OVERVIEW ===== */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {editing && (
                <form onSubmit={handleSave} className="space-y-4">
                  <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Edit Group</h4>
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <label className="block text-[13px] font-medium text-slate-600 mb-1.5">Group Name</label>
                      <input value={editForm.name} onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))} required className={inputCls} />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[13px] font-medium text-slate-600 mb-1.5">Description</label>
                      <input value={editForm.description} onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Optional description" className={inputCls} />
                    </div>
                    <button type="submit" className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 transition-all">Save</button>
                  </div>
                </form>
              )}

              {!editing && (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                    <StatCard label="Total" value={devices.length} color="text-slate-800" />
                    <StatCard label="Active" value={activeDevices.length} color="text-indigo-600" />
                    <StatCard label="Online" value={online} color="text-emerald-600" />
                    <StatCard label="Offline" value={offline} color="text-red-600" />
                    <StatCard label="Warning" value={warning} color="text-amber-600" />
                    <div className="bg-slate-50 rounded-lg p-3.5">
                      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Health</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-2xl font-semibold text-slate-800">{healthPct}%</p>
                        <div className="flex-1 bg-slate-200 rounded-full h-2">
                          <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${healthPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sensor Subgroups */}
                  <SensorSubgroups activeDevices={activeDevices} aggResults={aggResults} />
                </>
              )}
            </div>
          )}

          {/* ===== DEVICES ===== */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              <DeviceTable title={`Active Devices (${activeDevices.length})`} devices={activeDevices} />
              {decommissionedDevices.length > 0 && (
                <DeviceTable title={`Decommissioned (${decommissionedDevices.length})`} devices={decommissionedDevices} muted />
              )}
            </div>
          )}

          {/* ===== AGGREGATIONS ===== */}
          {activeTab === 'aggregations' && (
            <AggregationsTab
              groupId={id}
              aggMeta={aggMeta}
              aggJobs={aggJobs}
              setAggJobs={setAggJobs}
              aggResults={aggResults}
              setAggResults={setAggResults}
              showAggForm={showAggForm}
              setShowAggForm={setShowAggForm}
              aggForm={aggForm}
              setAggForm={setAggForm}
              aggCreating={aggCreating}
              setAggCreating={setAggCreating}
            />
          )}

          {/* ===== ALERT RULES ===== */}
          {activeTab === 'rules' && (
            <RulesPanel scope="group" scopeId={id} embedded />
          )}
        </div>
      </div>
    </div>
  )
}


function StatCard({ label, value, color }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3.5">
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-semibold mt-0.5 ${color}`}>{value}</p>
    </div>
  )
}


function SensorSubgroups({ activeDevices, aggResults }) {
  const subgroups = {}
  activeDevices.forEach(d => {
    const mt = d.metric_type || 'unassigned'
    if (!subgroups[mt]) subgroups[mt] = []
    subgroups[mt].push(d)
  })
  const entries = Object.entries(subgroups).sort((a, b) => b[1].length - a[1].length)
  if (entries.length <= 1 && entries[0]?.[0] === 'unassigned') return null

  const subgroupAggs = {}
  aggResults.forEach(r => {
    const mt = r.metric || ''
    if (!subgroupAggs[mt]) subgroupAggs[mt] = []
    subgroupAggs[mt].push(r)
  })

  return (
    <div>
      <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Sensor Subgroups</h4>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {entries.map(([mt, devs]) => {
          const onlineCount = devs.filter(d => d.status === 'online').length
          const cls = METRIC_COLORS[mt] || METRIC_COLORS.unassigned
          const aggs = subgroupAggs[mt] || []
          return (
            <div key={mt} className={`rounded-lg border p-4 ${cls}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-semibold">{METRIC_LABELS[mt] || mt}</span>
                <span className="text-[11px] font-medium opacity-70">{devs.length} devices</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] opacity-80">
                <span>{onlineCount} online</span>
                <span>{devs.length - onlineCount} other</span>
              </div>
              {aggs.length > 0 && (
                <div className="mt-2 pt-2 border-t border-current/10 space-y-1">
                  {aggs.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="opacity-70">{r.job_name || `${r.function?.toUpperCase()}(${METRIC_LABELS[r.metric] || r.metric})`}</span>
                      <span className="font-semibold">{r.value !== null && r.value !== undefined ? r.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : 'N/A'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


function AggregationsTab({ groupId, aggMeta, aggJobs, setAggJobs, aggResults, setAggResults, showAggForm, setShowAggForm, aggForm, setAggForm, aggCreating, setAggCreating }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Aggregation Jobs</h4>
        <button
          onClick={() => { setShowAggForm(!showAggForm); setAggForm({ metric: '', function: 'avg', level: 'group', window_secs: 3600, name: '' }) }}
          className={`flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all shadow-sm ${showAggForm ? 'bg-white text-slate-600 border border-slate-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20'}`}
        >
          {showAggForm ? (
            <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>Cancel</>
          ) : (
            <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>New Job</>
          )}
        </button>
      </div>

      {showAggForm && aggMeta && (
        <div className="bg-slate-50 rounded-lg p-5 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Metric</label>
              <select value={aggForm.metric} onChange={e => setAggForm(p => ({ ...p, metric: e.target.value }))} className={inputCls}>
                <option value="">Select...</option>
                {aggMeta.metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Function</label>
              <select value={aggForm.function} onChange={e => setAggForm(p => ({ ...p, function: e.target.value }))} className={inputCls}>
                {aggMeta.functions.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Level</label>
              <select value={aggForm.level} onChange={e => setAggForm(p => ({ ...p, level: e.target.value }))} className={inputCls}>
                <option value="group">Group (all devices)</option>
                <option value="device">Per Device</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Window</label>
              <select value={aggForm.window_secs} onChange={e => setAggForm(p => ({ ...p, window_secs: parseInt(e.target.value) }))} className={inputCls}>
                {aggMeta.windows.map(w => <option key={w.secs} value={w.secs}>{w.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Name (optional)</label>
              <input value={aggForm.name} onChange={e => setAggForm(p => ({ ...p, name: e.target.value }))} placeholder="Auto-generated" className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              disabled={!aggForm.metric || aggCreating}
              onClick={async () => {
                setAggCreating(true)
                try {
                  const res = await api.post(`/api/groups/${groupId}/aggregations`, aggForm)
                  setAggJobs(prev => [res.data, ...prev])
                  setShowAggForm(false)
                } finally { setAggCreating(false) }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-[13px] font-medium rounded-lg hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {aggCreating ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </div>
      )}

      {aggJobs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {aggJobs.map(job => {
            const result = aggResults.find(r => r.job_id === job.id)
            const metricMeta = aggMeta?.metrics?.find(m => m.key === job.metric)
            return (
              <div key={job.id} className={`rounded-lg border overflow-hidden transition-opacity ${job.enabled ? 'border-slate-200 bg-white' : 'border-slate-200/50 bg-slate-50/50 opacity-50'}`}>
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="min-w-0">
                    <h4 className="text-[13px] font-semibold text-slate-800 truncate">{job.name}</h4>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                      <span className={`px-1.5 py-0.5 rounded font-medium ${job.level === 'group' ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'}`}>
                        {job.level === 'group' ? 'Group' : 'Per Device'}
                      </span>
                      <span>{windowLabel(job.window_secs)} window</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={async () => {
                        const res = await api.put(`/api/aggregations/${job.id}/toggle`)
                        setAggJobs(prev => prev.map(j => j.id === job.id ? res.data : j))
                      }}
                      className={`w-8 h-5 rounded-full relative transition-colors ${job.enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}
                      title={job.enabled ? 'Disable' : 'Enable'}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${job.enabled ? 'left-3.5' : 'left-0.5'}`} />
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('Delete this aggregation job?')) return
                        await api.delete(`/api/aggregations/${job.id}`)
                        setAggJobs(prev => prev.filter(j => j.id !== job.id))
                        setAggResults(prev => prev.filter(r => r.job_id !== job.id))
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    </button>
                  </div>
                </div>
                <div className="px-4 py-3">
                  {result && result.value !== null ? (
                    <div>
                      <p className="text-2xl font-semibold text-slate-800 tracking-tight">
                        {typeof result.value === 'number' ? result.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'N/A'}
                        {metricMeta?.unit && <span className="text-sm font-normal text-slate-400 ml-1">{metricMeta.unit}</span>}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">{result.sample_count} samples &middot; Updated {timeAgo(result.computed_at)}</p>
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      <p className="text-[11px] text-slate-400">{job.enabled ? 'Computing...' : 'Disabled'}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : !showAggForm && (
        <div className="py-10 text-center">
          <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
          <p className="text-sm text-slate-500 font-medium">No aggregation jobs</p>
          <p className="text-[11px] text-slate-400 mt-1">Create jobs to compute metrics like avg temperature, max CPU usage, etc.</p>
        </div>
      )}
    </div>
  )
}


function DeviceTable({ title, devices, muted }) {
  return (
    <div className={muted ? 'opacity-75' : ''}>
      <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</h4>
      {devices.length > 0 ? (
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Device ID</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Metric</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Redundancy</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {devices.map(device => {
                const metricCls = METRIC_COLORS[device.metric_type] || 'bg-slate-50 text-slate-500 border-slate-200'
                return (
                  <tr key={device.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2.5 text-[12px] text-slate-400 font-mono">{shortId(device.id)}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/devices/${device.id}`} className="text-[13px] font-medium text-slate-800 hover:text-indigo-600 transition-colors">
                        {device.name}
                      </Link>
                      {device.location && <p className="text-[11px] text-slate-400 mt-0.5">{device.location}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-slate-600 capitalize">{device.type}</td>
                    <td className="px-4 py-2.5">
                      {device.metric_type ? (
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${metricCls}`}>{METRIC_LABELS[device.metric_type] || device.metric_type}</span>
                      ) : <span className="text-[11px] text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {device.redundancy_group ? (
                        <Link to={`/devices?rg=${encodeURIComponent(device.redundancy_group)}`} className="text-[11px] font-mono text-slate-500 hover:text-indigo-600 hover:underline transition-colors">
                          {device.redundancy_group}
                        </Link>
                      ) : <span className="text-[11px] text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={device.status} /></td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-400">{timeAgo(device.last_seen)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-10 text-center">
          <p className="text-sm text-slate-400">No devices</p>
        </div>
      )}
    </div>
  )
}
