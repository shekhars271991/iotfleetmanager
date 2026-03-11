import { useState, useEffect } from 'react'

const DEVICE_TYPES = ['sensor', 'gateway', 'actuator', 'camera']
const STATUSES = ['online', 'offline', 'warning']
const ALL_METRICS = ['temp', 'humidity', 'battery_pct', 'cpu_usage', 'mem_usage', 'uplink_kbps', 'position', 'power_on', 'fps', 'storage_pct', 'pressure', 'noise_db', 'vibration', 'lux']
const METRIC_LABELS = {
  temp: 'Temperature', humidity: 'Humidity', battery_pct: 'Battery %', cpu_usage: 'CPU Usage',
  mem_usage: 'Memory Usage', uplink_kbps: 'Uplink kbps', position: 'Position', power_on: 'Power On/Off',
  fps: 'FPS', storage_pct: 'Storage %', pressure: 'Pressure', noise_db: 'Noise dB', vibration: 'Vibration', lux: 'Light (lux)',
}

const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-colors'
const labelCls = 'block text-[13px] font-medium text-slate-600 mb-1.5'

export default function DeviceForm({ device, groups, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: '', type: 'sensor', status: 'online', ip_address: '', firmware_ver: '',
    location: '', group_id: '', latitude: '', longitude: '', redundancy_group: '',
    metric_type: '', tags: {},
  })
  const [tagKey, setTagKey] = useState('')
  const [tagVal, setTagVal] = useState('')

  useEffect(() => {
    if (device) {
      setForm({
        name: device.name || '',
        type: device.type || 'sensor',
        status: device.status || 'online',
        ip_address: device.ip_address || '',
        firmware_ver: device.firmware_ver || '',
        location: device.location || '',
        group_id: device.group_id || '',
        latitude: device.latitude ?? '',
        longitude: device.longitude ?? '',
        redundancy_group: device.redundancy_group || '',
        metric_type: device.metric_type || '',
        tags: device.tags || {},
      })
    }
  }, [device])

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const addTag = () => {
    if (!tagKey.trim()) return
    setForm(prev => ({ ...prev, tags: { ...prev.tags, [tagKey.trim()]: tagVal.trim() } }))
    setTagKey('')
    setTagVal('')
  }

  const removeTag = (k) => {
    setForm(prev => {
      const next = { ...prev.tags }
      delete next[k]
      return { ...prev, tags: next }
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = { ...form }
    data.latitude = data.latitude !== '' ? parseFloat(data.latitude) : null
    data.longitude = data.longitude !== '' ? parseFloat(data.longitude) : null
    data.tags = Object.keys(data.tags).length > 0 ? data.tags : null
    data.redundancy_group = data.redundancy_group || null
    data.metric_type = data.metric_type || null
    onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        <div>
          <label className={labelCls}>Device Name</label>
          <input name="name" value={form.name} onChange={handleChange} required placeholder="e.g. Temp Sensor A1" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select name="type" value={form.type} onChange={handleChange} className={inputCls}>
            {DEVICE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select name="status" value={form.status} onChange={handleChange} className={inputCls}>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>IP Address</label>
          <input name="ip_address" value={form.ip_address} onChange={handleChange} placeholder="192.168.1.10" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Firmware Version</label>
          <input name="firmware_ver" value={form.firmware_ver} onChange={handleChange} placeholder="2.1.0" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Location</label>
          <input name="location" value={form.location} onChange={handleChange} placeholder="Warehouse A - Zone 1" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Latitude</label>
          <input name="latitude" type="number" step="any" value={form.latitude} onChange={handleChange} placeholder="37.7749" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Longitude</label>
          <input name="longitude" type="number" step="any" value={form.longitude} onChange={handleChange} placeholder="-122.4194" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Redundancy Group</label>
          <input name="redundancy_group" value={form.redundancy_group} onChange={handleChange} placeholder="e.g. zone-a-temp" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Group</label>
          <select name="group_id" value={form.group_id} onChange={handleChange} className={inputCls}>
            <option value="">No Group</option>
            {(groups || []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Metric Type (what this sensor reports)</label>
          <select name="metric_type" value={form.metric_type} onChange={handleChange} className={inputCls}>
            <option value="">Select metric...</option>
            {ALL_METRICS.map(m => <option key={m} value={m}>{METRIC_LABELS[m] || m}</option>)}
          </select>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className={labelCls}>Tags</label>
        {Object.keys(form.tags).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {Object.entries(form.tags).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-[11px] font-medium rounded-md">
                {k}={v}
                <button type="button" onClick={() => removeTag(k)} className="text-slate-400 hover:text-red-500 ml-0.5">&times;</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input value={tagKey} onChange={e => setTagKey(e.target.value)} placeholder="Key (e.g. zone)" className={`${inputCls} w-36`} />
          <input value={tagVal} onChange={e => setTagVal(e.target.value)} placeholder="Value (e.g. north)" className={`${inputCls} w-36`}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} />
          <button type="button" onClick={addTag} disabled={!tagKey.trim()}
            className="px-3 py-2 bg-slate-100 text-slate-600 text-[12px] font-medium rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40">
            Add
          </button>
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button type="submit"
          className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 transition-all">
          {device ? 'Save Changes' : 'Add Device'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-5 py-2 bg-white text-slate-600 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
