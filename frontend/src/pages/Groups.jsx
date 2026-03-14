import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useShowcase } from '../context/ShowcaseContext'

const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-colors'

export default function Groups() {
  const { labels } = useShowcase()
  const [groups, setGroups] = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [newGroup, setNewGroup] = useState({ name: '', description: '' })
  const [showForm, setShowForm] = useState(false)

  const fetchData = () => {
    Promise.all([
      api.get('/api/groups'),
      api.get('/api/devices'),
    ]).then(([grpRes, devRes]) => {
      setGroups(grpRes.data)
      setDevices(devRes.data)
      setLoading(false)
    })
  }

  useEffect(() => { fetchData() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newGroup.name.trim()) return
    await api.post('/api/groups', newGroup)
    setNewGroup({ name: '', description: '' })
    setShowForm(false)
    fetchData()
  }

  const handleDelete = async (e, id) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this group?')) return
    await api.delete(`/api/groups/${id}`)
    fetchData()
  }

  const devicesInGroup = (groupId) => devices.filter(d => d.group_id === groupId)

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-36 bg-slate-100 rounded-xl" />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">{labels.devices} {labels.groups}</h2>
          <p className="text-sm text-slate-500 mt-0.5">Organize devices by location or function</p>
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
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              Close
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              New Group
            </>
          )}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Create {labels.group}</h3>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-[13px] font-medium text-slate-600 mb-1.5">{labels.group} Name</label>
              <input
                value={newGroup.name}
                onChange={e => setNewGroup(prev => ({ ...prev, name: e.target.value }))}
                required
                placeholder="e.g. Warehouse A"
                className={inputCls}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[13px] font-medium text-slate-600 mb-1.5">Description</label>
              <input
                value={newGroup.description}
                onChange={e => setNewGroup(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
                className={inputCls}
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 transition-all"
            >
              Create
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map(group => {
          const groupDevices = devicesInGroup(group.id)
          const activeDevices = groupDevices.filter(d => d.status !== 'decommissioned')
          const online = activeDevices.filter(d => d.status === 'online').length
          const offline = activeDevices.filter(d => d.status === 'offline').length
          const warning = activeDevices.filter(d => d.status === 'warning').length
          const decom = groupDevices.length - activeDevices.length
          const healthPct = activeDevices.length ? Math.round((online / activeDevices.length) * 100) : 0

          return (
            <Link
              key={group.id}
              to={`/groups/${group.id}`}
              className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md hover:border-slate-300 transition-all group block"
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">{group.name}</h3>
                <button
                  onClick={(e) => handleDelete(e, group.id)}
                  className="text-[11px] text-slate-400 hover:text-red-500 font-medium transition-colors opacity-0 group-hover:opacity-100"
                >
                  Delete
                </button>
              </div>
              {group.description && (
                <p className="text-[11px] text-slate-400 mb-3">{group.description}</p>
              )}
              {!group.description && <div className="mb-3" />}

              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${healthPct}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-slate-500">{healthPct}%</span>
              </div>

              <div className="flex items-center gap-3 text-[11px] flex-wrap">
                <span className="text-slate-500 font-medium">{groupDevices.length} {groupDevices.length !== 1 ? labels.devices : labels.device}</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{online}</span>
                {offline > 0 && <span className="flex items-center gap-1 text-red-500"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{offline}</span>}
                {warning > 0 && <span className="flex items-center gap-1 text-amber-500"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{warning}</span>}
                {decom > 0 && <span className="flex items-center gap-1 text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />{decom}</span>}
                <svg className="w-4 h-4 text-slate-300 ml-auto group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </div>
            </Link>
          )
        })}

        {groups.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm p-16 text-center">
            <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z" />
            </svg>
            <p className="text-sm font-medium text-slate-600">No {labels.groups.toLowerCase()} yet</p>
            <p className="text-[11px] text-slate-400 mt-1">Create your first {labels.group.toLowerCase()} to organize {labels.devices.toLowerCase()}</p>
          </div>
        )}
      </div>
    </div>
  )
}
