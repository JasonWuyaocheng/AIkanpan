import { useMemo, useState } from 'react'
import { api, type Quote, type PositionWithPnl } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import { fmtNum, fmtAmount, pctClass, fmtPct } from '../../utils/format'
import { ErrorState, LoadingState, RefreshState } from '../RequestState'

export function PositionPanel({ active }: { active: boolean }) {
  const pos = usePolling(() => api.positions(), 15_000)
  const secids = useMemo(() => pos.data?.items.map((i) => i.secid) ?? [], [pos.data])
  const quotes = usePolling<Quote[]>(
    () => (secids.length ? api.quotes(secids).then((r) => r.items) : Promise.resolve([])),
    5000,
    [secids.join(',')],
  )

  const [form, setForm] = useState({ symbol: '', name: '', buyPrice: '', quantity: '', buyDate: new Date().toISOString().slice(0, 10) })
  const [formErr, setFormErr] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!active) return null

  const quoteMap = new Map((quotes.data ?? []).map((q) => [q.secid, q]))
  const rows: PositionWithPnl[] = (pos.data?.items ?? []).flatMap((p) => {
    const q = quoteMap.get(p.secid)
    if (!q) return []
    return [{
      ...p,
      price: q.price,
      changePct: q.changePct,
      pnlAmount: (q.price - p.buyPrice) * p.quantity,
      pnlPct: ((q.price - p.buyPrice) / p.buyPrice) * 100,
    }]
  })

  const totalPnl = rows.reduce((a, r) => a + r.pnlAmount, 0)
  const totalCost = rows.reduce((a, r) => a + r.buyPrice * r.quantity, 0)
  const totalPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0
  const hasPositions = (pos.data?.items.length ?? 0) > 0
  const retryPositions = () => { pos.refresh().catch(() => undefined) }
  const retryQuotes = () => { quotes.refresh().catch(() => undefined) }

  const submit = async () => {
    setFormErr(null)
    setActionError(null)
    const secid = form.symbol.startsWith('6') ? `1.${form.symbol}` : `0.${form.symbol}`
    if (!/^\d{6}$/.test(form.symbol)) return setFormErr('代码须为 6 位数字')
    if (!form.name.trim()) return setFormErr('请填写名称')
    const buyPrice = +form.buyPrice
    const quantity = +form.quantity
    if (!(buyPrice > 0) || !(quantity > 0)) return setFormErr('价格和数量须为正数')
    setSaving(true)
    try {
      await api.addPosition({
        secid,
        symbol: form.symbol,
        name: form.name.trim(),
        buyPrice,
        quantity: Math.round(quantity),
        buyDate: form.buyDate,
      })
      setForm({ symbol: '', name: '', buyPrice: '', quantity: '', buyDate: new Date().toISOString().slice(0, 10) })
      pos.refresh().catch((err: any) => setActionError(err?.message ?? '持仓已保存，但列表刷新失败'))
    } catch (err: any) {
      setFormErr(err?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setActionError(null)
    try {
      await api.removePosition(id)
      pos.refresh().catch((err: any) => setActionError(err?.message ?? '删除成功，但列表刷新失败'))
    } catch (err: any) {
      setActionError(err?.message ?? '删除失败')
    }
  }

  return (
    <div className="panel-page">
      <div className="section-heading">
        <div className="section-title">持仓盈亏</div>
        <RefreshState loading={false} refreshing={pos.refreshing} error={pos.stale ? pos.error : null} stale={pos.stale} onRetry={retryPositions} />
      </div>
      <div className="card form-card">
        <div className="form-row">
          <label htmlFor="position-symbol">代码</label>
          <input id="position-symbol" style={{ width: 90 }} value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.trim() })} placeholder="600519" />
          <label htmlFor="position-name">名称</label>
          <input id="position-name" style={{ width: 110 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="贵州茅台" />
          <label htmlFor="position-cost">成本价</label>
          <input id="position-cost" style={{ width: 90 }} value={form.buyPrice} onChange={(e) => setForm({ ...form, buyPrice: e.target.value })} placeholder="1243.88" />
          <label htmlFor="position-quantity">数量</label>
          <input id="position-quantity" style={{ width: 90 }} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="100" />
          <label htmlFor="position-date">日期</label>
          <input id="position-date" style={{ width: 130 }} type="date" value={form.buyDate} onChange={(e) => setForm({ ...form, buyDate: e.target.value })} />
          <button type="button" className="btn" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '添加持仓'}
          </button>
        </div>
        <div className="hint">成本价按买入均价填写；盈亏会随最新行情自动更新，仅供记账参考。</div>
        {formErr && <div className="hint up" role="alert">{formErr}</div>}
      </div>

      {pos.loading ? (
        <LoadingState label="正在加载持仓记录…" />
      ) : pos.error && !pos.data ? (
        <ErrorState message={pos.error} onRetry={retryPositions} />
      ) : !hasPositions ? (
        <div className="empty">
          <strong>暂无持仓</strong>
          <span>在上方填写买入代码、成本价和数量即可开始记录。</span>
        </div>
      ) : quotes.error && !quotes.data ? (
        <ErrorState message={`行情获取失败：${quotes.error}`} onRetry={retryQuotes} />
      ) : quotes.loading && !quotes.data ? (
        <LoadingState label="持仓已加载，正在获取最新行情…" />
      ) : (
        <>
          <RefreshState loading={false} refreshing={quotes.refreshing} error={quotes.error} stale={quotes.stale} onRetry={retryQuotes} />
          {rows.length > 0 && (
            <div className="pnl-summary card">
              <div className="stat">
                <div className="label">总浮动盈亏</div>
                <div className={`value ${pctClass(totalPnl)}`}>
                  {totalPnl > 0 ? '+' : ''}{fmtNum(totalPnl)}（{fmtPct(totalPct)}）
                </div>
              </div>
              <div className="stat">
                <div className="label">持仓市值</div>
                <div className="value">{fmtAmount(rows.reduce((a, r) => a + r.price * r.quantity, 0))}</div>
              </div>
              <div className="stat">
                <div className="label">持仓成本</div>
                <div className="value">{fmtAmount(totalCost)}</div>
              </div>
            </div>
          )}
          {rows.length === 0 ? (
            <div className="empty">持仓记录已保留，当前暂无可用行情。</div>
          ) : (
            <div className="table-scroll">
              <table className="grid position-grid">
                <thead>
                  <tr>
                    <th>名称</th><th>代码</th><th>成本价</th><th>数量</th><th>现价</th>
                    <th>今日涨跌</th><th>浮动盈亏</th><th>盈亏比例</th><th>买入日期</th><th aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td className="flat">{r.symbol}</td>
                      <td>{fmtNum(r.buyPrice)}</td>
                      <td>{r.quantity}</td>
                      <td className={pctClass(r.changePct)}>{fmtNum(r.price)}</td>
                      <td className={pctClass(r.changePct)}>{fmtPct(r.changePct)}</td>
                      <td className={pctClass(r.pnlAmount)}>{r.pnlAmount > 0 ? '+' : ''}{fmtNum(r.pnlAmount)}</td>
                      <td className={pctClass(r.pnlPct)}>{fmtPct(r.pnlPct)}</td>
                      <td className="flat">{r.buyDate}</td>
                      <td><button type="button" className="btn danger small" onClick={() => remove(r.id)}>删除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {actionError && <div className="hint up" role="alert">{actionError}</div>}
    </div>
  )
}
