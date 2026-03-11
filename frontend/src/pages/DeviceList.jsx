import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import StatusBadge from '../components/StatusBadge'
import DeviceForm from '../components/DeviceForm'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const METRIC_LABELS = {
  temp: 'Temperature', humidity: 'Humidity', battery_pct: 'Battery', cpu_usage: 'CPU Usage',
  mem_usage: 'Memory', uplink_kbps: 'Uplink', position: 'Position', power_on: 'Power',
  fps: 'FPS', storage_pct: 'Storage', pressure: 'Pressure', noise_db: 'Noise',
  vibration: 'Vibration', lux: 'Light',
}

const METRIC_COLORS = {
  temp: 'bg-orange-50 text-orange-600 border-orange-100',
  humidity: 'bg-blue-50 text-blue-600 border-blue-100',
  battery_pct: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  cpu_usage: 'bg-violet-50 text-violet-600 border-violet-100',
  mem_usage: 'bg-cyan-50 text-cyan-600 border-cyan-100',
  uplink_kbps: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  pressure: 'bg-sky-50 text-sky-600 border-sky-100',
  noise_db: 'bg-pink-50 text-pink-600 border-pink-100',
  vibration: 'bg-red-50 text-red-600 border-red-100',
  lux: 'bg-yellow-50 text-yellow-600 border-yellow-100',
  position: 'bg-teal-50 text-teal-600 border-teal-100',
  power_on: 'bg-amber-50 text-amber-600 border-amber-100',
  fps: 'bg-rose-50 text-rose-600 border-rose-100',
  storage_pct: 'bg-slate-100 text-slate-600 border-slate-200',
}

const selectCls = 'px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-colors cursor-pointer'
const searchCls = 'px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-colors w-56'

export default function DeviceList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [devices, setDevices] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [alertCounts, setAlertCounts] = useState({})

  // Filters from URL params (so links like ?redundancy_group=xxx work)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || '')
  const [metricFilter, setMetricFilter] = useState(searchParams.get('metric') || '')
  const [groupFilter, setGroupFilter] = useState(searchParams.get('group') || '')
  const [rgFilter, setRgFilter] = useState(searchParams.get('rg') || '')
  const [search, setSearch] = useState(searchParams.get('q') || '')

  const fetchDevices = () => {
    const params = {}
    if (statusFilter) params.status = statusFilter
    if (typeFilter) params.type = typeFilter
    api.get('/api/devices', { params }).then(res => {
      setDevices(res.data)
      setLoading(false)
    })
  }

  useEffect(() => {
    api.get('/api/groups').then(res => setGroups(res.data))
    api.get('/api/alerts').then(res => {
      const counts = {}
      ;(res.data || []).forEach(a => {
        if (!a.acknowledged) counts[a.device_id] = (counts[a.device_id] || 0) + 1
      })
      setAlertCounts(counts)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchDevices()
  }, [statusFilter, typeFilter])

  // Derive unique filter options from loaded data
  const filterOptions = useMemo(() => {
    const metricTypes = new Set()
    const redundancyGroups = new Set()
    devices.forEach(d => {
      if (d.metric_type) metricTypes.add(d.metric_type)
      if (d.redundancy_group) redundancyGroups.add(d.redundancy_group)
    })
    return {
      metricTypes: [...metricTypes].sort(),
      redundancyGroups: [...redundancyGroups].sort(),
    }
  }, [devices])

  // Client-side filtering for metric_type, group, redundancy_group, and search
  const filtered = useMemo(() => {
    let list = devices
    if (metricFilter) list = list.filter(d => d.metric_type === metricFilter)
    if (groupFilter) list = list.filter(d => d.group_id === groupFilter)
    if (rgFilter) list = list.filter(d => d.redundancy_group === rgFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(d =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.id || '').toLowerCase().includes(q) ||
        (d.location || '').toLowerCase().includes(q) ||
        (d.ip_address || '').toLowerCase().includes(q) ||
        (d.redundancy_group || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [devices, metricFilter, groupFilter, rgFilter, search])

  const handleAddDevice = async (form) => {
    await api.post('/api/devices', form)
    setShowForm(false)
    fetchDevices()
  }

  const hasActiveFilters = statusFilter || typeFilter || metricFilter || groupFilter || rgFilter || search
  const clearAll = () => {
    setStatusFilter(''); setTypeFilter(''); setMetricFilter(''); setGroupFilter(''); setRgFilter(''); setSearch('')
    setSearchParams({})
  }

  const groupMap = useMemo(() => {
    const m = {}
    groups.forEach(g => { m[g.id] = g.name })
    return m
  }, [groups])

  return (
    <div className="p-8 space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Devices</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage and monitor all fleet devices</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all shadow-sm ${
            showForm
              ? 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20'
          }`}
        >
          {showForm ? (
            <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>Close</>
          ) : (
            <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>Add Device</>
          )}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">New Device</h3>
          <DeviceForm groups={groups} onSubmit={handleAddDevice} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" /></svg>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, ID, location..."
            className={searchCls}
          />

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectCls}>
            <option value="">All Statuses</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="warning">Warning</option>
            <option value="decommissioned">Decommissioned</option>
          </select>

          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={selectCls}>
            <option value="">All Types</option>
            <option value="sensor">Sensor</option>
            <option value="gateway">Gateway</option>
            <option value="actuator">Actuator</option>
            <option value="camera">Camera</option>
          </select>

          <select value={metricFilter} onChange={e => setMetricFilter(e.target.value)} className={selectCls}>
            <option value="">All Metrics</option>
            {filterOptions.metricTypes.map(m => (
              <option key={m} value={m}>{METRIC_LABELS[m] || m}</option>
            ))}
          </select>

          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className={selectCls}>
            <option value="">All Groups</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>

          <select value={rgFilter} onChange={e => setRgFilter(e.target.value)} className={selectCls}>
            <option value="">All Redundancy Groups</option>
            {filterOptions.redundancyGroups.map(rg => (
              <option key={rg} value={rg}>{rg}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button onClick={clearAll} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium ml-1">
              Clear all
            </button>
          )}

          <span className="ml-auto text-[11px] text-slate-400 font-medium shrink-0">
            {filtered.length}{filtered.length !== devices.length ? ` of ${devices.length}` : ''} device{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
            {search && <FilterPill label={`"${search}"`} onRemove={() => setSearch('')} />}
            {statusFilter && <FilterPill label={`Status: ${statusFilter}`} onRemove={() => setStatusFilter('')} />}
            {typeFilter && <FilterPill label={`Type: ${typeFilter}`} onRemove={() => setTypeFilter('')} />}
            {metricFilter && <FilterPill label={`Metric: ${METRIC_LABELS[metricFilter] || metricFilter}`} onRemove={() => setMetricFilter('')} />}
            {groupFilter && <FilterPill label={`Group: ${groupMap[groupFilter] || groupFilter.substring(0, 8)}`} onRemove={() => setGroupFilter('')} />}
            {rgFilter && <FilterPill label={`RG: ${rgFilter}`} onRemove={() => setRgFilter('')} />}
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-lg" />)}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Device ID</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Metric</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Group</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Redundancy</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Last Seen</th>
                  <th className="w-8 px-2 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(device => {
                  const metricCls = METRIC_COLORS[device.metric_type] || 'bg-slate-50 text-slate-500 border-slate-200'
                  return (
                    <tr
                      key={device.id}
                      onClick={() => navigate(`/devices/${device.id}`)}
                      className="hover:bg-indigo-50/40 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3 text-[12px] text-slate-400 font-mono">{device.id ? device.id.substring(0, 8) : ''}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-slate-800 group-hover:text-indigo-600 transition-colors">
                            {device.name}
                          </span>
                          {alertCounts[device.id] > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-semibold" title={`${alertCounts[device.id]} unacknowledged alert${alertCounts[device.id] > 1 ? 's' : ''}`}>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>
                              {alertCounts[device.id]}
                            </span>
                          )}
                        </div>
                        {device.location && <p className="text-[11px] text-slate-400 mt-0.5">{device.location}</p>}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-600 capitalize">{device.type}</td>
                      <td className="px-4 py-3">
                        {device.metric_type ? (
                          <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-md border ${metricCls}`}>
                            {METRIC_LABELS[device.metric_type] || device.metric_type}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={device.status} /></td>
                      <td className="px-4 py-3">
                        {device.group_id && groupMap[device.group_id] ? (
                          <span className="text-[12px] text-slate-600">{groupMap[device.group_id]}</span>
                        ) : (
                          <span className="text-[11px] text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {device.redundancy_group ? (
                          <button
                            onClick={e => { e.stopPropagation(); setRgFilter(device.redundancy_group) }}
                            className="text-[11px] font-mono text-slate-500 hover:text-indigo-600 hover:underline transition-colors"
                            title={`Filter by redundancy group: ${device.redundancy_group}`}
                          >
                            {device.redundancy_group}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-400 whitespace-nowrap">{timeAgo(device.last_seen)}</td>
                      <td className="px-2 py-3 text-right">
                        <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center">
                      <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" /></svg>
                      <p className="text-sm text-slate-500 font-medium">No devices match your filters</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Try adjusting your filter criteria</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterPill({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 text-[11px] font-medium rounded-md border border-indigo-100">
      {label}
      <button onClick={onRemove} className="text-indigo-400 hover:text-indigo-700 ml-0.5">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </span>
  )
}
