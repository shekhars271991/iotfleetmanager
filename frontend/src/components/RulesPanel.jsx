import { useState, useEffect } from 'react'
import api from '../api/client'

const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-colors'

const OP_LABELS = { gt: '>', lt: '<', gte: '≥', lte: '≤' }
const SEV_STYLES = {
  warning: 'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-700',
}

const TPL_ICONS = {
  warning: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>,
  server: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" /></svg>,
  battery: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 10.5h.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H21M3.75 18h15A2.25 2.25 0 0 0 21 15.75v-6a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 1.5 9.75v6A2.25 2.25 0 0 0 3.75 18Z" /></svg>,
  thermometer: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" /></svg>,
  signal: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>,
}

export default function RulesPanel({ scope, scopeId, embedded }) {
  const [meta, setMeta] = useState(null)
  const [rules, setRules] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [form, setForm] = useState({ name: '', metric: '', operator: 'gt', threshold: '', severity: 'warning' })
  const [creating, setCreating] = useState(false)
  const [applying, setApplying] = useState(null)

  const fetchRules = () => {
    api.get('/api/rules', { params: { scope, scope_id: scopeId } }).then(r => setRules(r.data)).catch(() => {})
  }

  useEffect(() => {
    api.get('/api/rules/meta').then(r => setMeta(r.data)).catch(() => {})
    fetchRules()
  }, [scope, scopeId])

  const handleCreate = async () => {
    if (!form.metric || !form.threshold) return
    setCreating(true)
    try {
      const res = await api.post('/api/rules', { ...form, scope, scope_id: scopeId, threshold: parseFloat(form.threshold) })
      setRules(prev => [res.data, ...prev])
      setShowForm(false)
      setForm({ name: '', metric: '', operator: 'gt', threshold: '', severity: 'warning' })
    } finally { setCreating(false) }
  }

  const handleApplyTemplate = async (templateId) => {
    setApplying(templateId)
    try {
      const res = await api.post('/api/rules/apply-template', { template_id: templateId, scope, scope_id: scopeId })
      setRules(prev => [...res.data, ...prev])
      setShowTemplates(false)
    } finally { setApplying(null) }
  }

  const handleToggle = async (ruleId) => {
    const res = await api.put(`/api/rules/${ruleId}/toggle`)
    setRules(prev => prev.map(r => r.id === ruleId ? res.data : r))
  }

  const handleDelete = async (ruleId) => {
    if (!confirm('Delete this rule?')) return
    await api.delete(`/api/rules/${ruleId}`)
    setRules(prev => prev.filter(r => r.id !== ruleId))
  }

  const enabledCount = rules.filter(r => r.enabled).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {!embedded ? (
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
            Alert Rules
            {rules.length > 0 && <span className="text-[11px] text-slate-400 font-normal">{enabledCount} active</span>}
          </h3>
        ) : (
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            Alert Rules
            {rules.length > 0 && <span className="text-[11px] text-slate-400 font-normal">{enabledCount} active</span>}
          </h4>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowTemplates(!showTemplates); setShowForm(false) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all shadow-sm ${
              showTemplates ? 'bg-white text-slate-600 border border-slate-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>
            {showTemplates ? 'Close' : 'Templates'}
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setShowTemplates(false) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all shadow-sm ${
              showForm ? 'bg-white text-slate-600 border border-slate-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20'
            }`}
          >
            {showForm ? (
              <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>Cancel</>
            ) : (
              <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>Custom Rule</>
            )}
          </button>
        </div>
      </div>

      {/* Template picker */}
      {showTemplates && meta && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {meta.templates.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => handleApplyTemplate(tpl.id)}
              disabled={applying === tpl.id}
              className="bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-300 hover:shadow-sm transition-all disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center mb-2">
                {TPL_ICONS[tpl.icon] || TPL_ICONS.warning}
              </div>
              <p className="text-[13px] font-semibold text-slate-800">{tpl.name}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{tpl.description}</p>
              <p className="text-[10px] text-indigo-500 font-medium mt-2">
                {applying === tpl.id ? 'Applying...' : `${tpl.rule_count} rules`}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Custom rule form */}
      {showForm && meta && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Metric</label>
              <select value={form.metric} onChange={e => setForm(p => ({ ...p, metric: e.target.value }))} className={inputCls}>
                <option value="">Select...</option>
                {meta.metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Operator</label>
              <select value={form.operator} onChange={e => setForm(p => ({ ...p, operator: e.target.value }))} className={inputCls}>
                {Object.entries(meta.operators).map(([k, v]) => <option key={k} value={k}>{v.label} {v.desc}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Threshold</label>
              <input type="number" value={form.threshold} onChange={e => setForm(p => ({ ...p, threshold: e.target.value }))} placeholder="e.g. 45" className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Severity</label>
              <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))} className={inputCls}>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Name (optional)</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Auto" className={inputCls} />
            </div>
            <div className="flex items-end">
              <button
                disabled={!form.metric || !form.threshold || creating}
                onClick={handleCreate}
                className="w-full px-4 py-2 bg-indigo-600 text-white text-[13px] font-medium rounded-lg hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {creating ? 'Creating...' : 'Add Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules list */}
      {rules.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Rule</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Condition</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Severity</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rules.map(rule => {
                const metricMeta = meta?.metrics?.find(m => m.key === rule.metric)
                return (
                  <tr key={rule.id} className={`transition-opacity ${rule.enabled ? '' : 'opacity-40'}`}>
                    <td className="px-4 py-2.5">
                      <span className="text-[13px] font-medium text-slate-800">{rule.name || `${metricMeta?.label || rule.metric} ${OP_LABELS[rule.operator]} ${rule.threshold}`}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[12px] text-slate-500 font-mono">
                        {metricMeta?.label || rule.metric} {OP_LABELS[rule.operator] || rule.operator} {rule.threshold}{metricMeta?.unit || ''}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium capitalize ${SEV_STYLES[rule.severity] || SEV_STYLES.warning}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${rule.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                        {rule.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleToggle(rule.id)}
                          className={`w-8 h-5 rounded-full relative transition-colors ${rule.enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}
                          title={rule.enabled ? 'Disable' : 'Enable'}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${rule.enabled ? 'left-3.5' : 'left-0.5'}`} />
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        !showForm && !showTemplates && (
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-8 text-center">
            <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
            <p className="text-sm text-slate-500 font-medium">No alert rules defined</p>
            <p className="text-[11px] text-slate-400 mt-1">Apply a template for quick setup, or create custom rules</p>
          </div>
        )
      )}
    </div>
  )
}
