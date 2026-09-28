import { useState } from 'react'
import { api, type Alert } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import { ALERT_TYPE_LABEL, fmtNum } from '../../utils/format'

export function AlertPanel({ active }: { active: boolean }) {
  const alerts = usePolling(() => api.alerts(), 10_000)
  const [form, setForm] = useState({ symbol: '', name: '', type: 'price_above' as Alert['type'], threshold: '' })
  const [err, setErr] = useState<string | null>(null)

  if (!active) return null

  const requestNotify = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }

  const submit = async () => {
    setErr(null)
    const symbol = form.symbol.trim()
    if (!/^\d{6}$/.test(symbol)) return setErr('代码须为 6 位数字')
    if (!form.name.trim()) return setErr('请填写名称')
    const threshold = +form.threshold
    if (!isFinite(threshold)) return setErr('请填写阈值数值')
    if ((form.type === 'pct_above' || form.type === 'pct_below') && Math.abs(threshold) > 30) {
      return setErr('涨跌幅阈值一般不超过 ±30%')
    }
    requestNotify()
    const secid = symbol.startsWith('6') ? `1.${symbol}` : `0.${symbol}`
    try {
      await api.addAlert({ secid, symbol, name: form.name.trim(), type: form.type, threshold })
      setForm({ ...form, symbol: '', name: '', threshold: '' })
      alerts.refresh()
    } catch (e: any) {
      setErr(e?.message ?? '保存失败')
    }
  }

  return (
    <div className="panel-page">
      <div className="section-title">到价预警</div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="form-row">
          <label>代码</label>
          <input style={{ width: 90 }} value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.trim() })} placeholder="600519" />
          <label>名称</label>
          <input style={{ width: 110 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="贵州茅台" />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Alert['type'] })}>
            <option value="price_above">价格 ≥</option>
            <option value="price_below">价格 ≤</option>
            <option value="pct_above">涨幅 ≥%</option>
            <option value="pct_below">跌幅 ≤%</option>
          </select>
          <input style={{ width: 100 }} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} placeholder="阈值" />
          <button className="btn" onClick={submit}>
            创建预警
          </button>
        </div>
        <div className="hint">触发后弹窗 + 系统通知，单次预警触发后自动停用。首次创建会请求通知权限。</div>
        {err && <div className="hint up">{err}</div>}
      </div>

      {alerts.data?.items.length === 0 ? (
        <div className="empty">暂无预警</div>
      ) : (
        (alerts.data?.items ?? []).map((a) => (
          <div className="alert-item" key={a.id}>
            <span>
              {a.name}（{a.symbol}）
            </span>
            <span className={a.type.startsWith('price') ? '' : a.type === 'pct_above' ? 'up' : 'down'}>
              {ALERT_TYPE_LABEL[a.type]} {fmtNum(a.threshold)}
            </span>
            <span className={`status-badge ${a.status === 'triggered' ? 'triggered' : a.enabled ? 'active' : 'disabled'}`}>
              {a.status === 'triggered' ? '已触发' : a.enabled ? '监控中' : '已停用'}
            </span>
            <span className="hint" style={{ flex: 1 }}>
              {a.lastTriggeredAt ? `触发于 ${new Date(a.lastTriggeredAt).toLocaleString()}` : `创建于 ${new Date(a.createdAt).toLocaleString()}`}
            </span>
            <button
              className="btn small"
              onClick={async () => {
                await api.toggleAlert(a.id, !a.enabled)
                alerts.refresh()
              }}
            >
              {a.enabled ? '停用' : '启用'}
            </button>
            <button
              className="btn danger small"
              onClick={async () => {
                await api.removeAlert(a.id)
                alerts.refresh()
              }}
            >
              删除
            </button>
          </div>
        ))
      )}
    </div>
  )
}
