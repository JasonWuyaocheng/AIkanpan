import { useState } from 'react'
import { api, type Alert } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import { ALERT_TYPE_LABEL, fmtNum } from '../../utils/format'
import { ErrorState, LoadingState, RefreshState } from '../RequestState'

export function AlertPanel({ active }: { active: boolean }) {
  const alerts = usePolling(() => api.alerts(), 10_000)
  const [form, setForm] = useState({ symbol: '', name: '', type: 'price_above' as Alert['type'], threshold: '' })
  const [err, setErr] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!active) return null

  const desktop = Boolean(window.aikanpanDesktop)
  const retry = () => { alerts.refresh().catch(() => undefined) }

  const requestNotify = () => {
    if (!desktop && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined)
    }
  }

  const submit = async () => {
    setErr(null)
    setActionError(null)
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
    setSaving(true)
    try {
      await api.addAlert({ secid, symbol, name: form.name.trim(), type: form.type, threshold })
      setForm({ ...form, symbol: '', name: '', threshold: '' })
      alerts.refresh().catch((error: any) => setActionError(error?.message ?? '预警已创建，但列表刷新失败'))
    } catch (e: any) {
      setErr(e?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (alert: Alert) => {
    setActionError(null)
    try {
      await api.toggleAlert(alert.id, !alert.enabled)
      alerts.refresh().catch((error: any) => setActionError(error?.message ?? '状态已更新，但列表刷新失败'))
    } catch (error: any) {
      setActionError(error?.message ?? '状态更新失败')
    }
  }

  const remove = async (id: string) => {
    setActionError(null)
    try {
      await api.removeAlert(id)
      alerts.refresh().catch((error: any) => setActionError(error?.message ?? '预警已删除，但列表刷新失败'))
    } catch (error: any) {
      setActionError(error?.message ?? '删除失败')
    }
  }

  return (
    <div className="panel-page">
      <div className="section-heading">
        <div className="section-title">到价预警</div>
        <RefreshState loading={false} refreshing={alerts.refreshing} error={alerts.stale ? alerts.error : null} stale={alerts.stale} onRetry={retry} />
      </div>
      <div className="card form-card">
        <div className="form-row">
          <label htmlFor="alert-symbol">代码</label>
          <input id="alert-symbol" style={{ width: 90 }} value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.trim() })} placeholder="600519" />
          <label htmlFor="alert-name">名称</label>
          <input id="alert-name" style={{ width: 110 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="贵州茅台" />
          <label htmlFor="alert-type">条件</label>
          <select id="alert-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Alert['type'] })}>
            <option value="price_above">价格 ≥</option>
            <option value="price_below">价格 ≤</option>
            <option value="pct_above">涨幅 ≥%</option>
            <option value="pct_below">跌幅 ≤%</option>
          </select>
          <label htmlFor="alert-threshold">阈值</label>
          <input id="alert-threshold" style={{ width: 100 }} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} placeholder="阈值" />
          <button type="button" className="btn" onClick={submit} disabled={saving}>
            {saving ? '创建中…' : '创建预警'}
          </button>
        </div>
        <div className="hint">
          {desktop
            ? '触发后显示桌面提醒；单次预警触发后自动停用。应用需保持运行才能持续监控。'
            : '触发后弹窗 + 系统通知，单次预警触发后自动停用。首次创建会请求通知权限。'}
        </div>
        {err && <div className="hint up" role="alert">{err}</div>}
      </div>

      {alerts.loading ? (
        <LoadingState label="正在加载预警…" />
      ) : alerts.error && !alerts.data ? (
        <ErrorState message={alerts.error} onRetry={retry} />
      ) : alerts.data?.items.length === 0 ? (
        <div className="empty">
          <strong>暂无预警</strong>
          <span>填写股票代码和阈值，创建一个到价提醒。</span>
        </div>
      ) : (
        <div className="alert-list">
          {(alerts.data?.items ?? []).map((a) => (
            <div className="alert-item" key={a.id}>
              <span className="alert-name">{a.name}<small>{a.symbol}</small></span>
              <span className={a.type.startsWith('price') ? '' : a.type === 'pct_above' ? 'up' : 'down'}>
                {ALERT_TYPE_LABEL[a.type]} {fmtNum(a.threshold)}
              </span>
              <span className={`status-badge ${a.status === 'triggered' ? 'triggered' : a.enabled ? 'active' : 'disabled'}`}>
                {a.status === 'triggered' ? '已触发' : a.enabled ? '监控中' : '已停用'}
              </span>
              <span className="hint alert-time">
                {a.lastTriggeredAt ? `触发于 ${new Date(a.lastTriggeredAt).toLocaleString()}` : `创建于 ${new Date(a.createdAt).toLocaleString()}`}
              </span>
              <button type="button" className="btn small" onClick={() => toggle(a)}>{a.enabled ? '停用' : '启用'}</button>
              <button type="button" className="btn danger small" onClick={() => remove(a.id)}>删除</button>
            </div>
          ))}
        </div>
      )}
      {actionError && <div className="hint up" role="alert">{actionError}</div>}
    </div>
  )
}
