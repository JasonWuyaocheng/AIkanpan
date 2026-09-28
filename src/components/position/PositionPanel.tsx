import { useMemo, useState } from 'react'
import { api, type Quote, type PositionWithPnl } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import { fmtNum, fmtAmount, pctClass, fmtPct } from '../../utils/format'

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

  if (!active) return null

  const quoteMap = new Map((quotes.data ?? []).map((q) => [q.secid, q]))
  const rows: PositionWithPnl[] = (pos.data?.items ?? []).flatMap((p) => {
    const q = quoteMap.get(p.secid)
    if (!q) return []
    return [
      {
        ...p,
        price: q.price,
        changePct: q.changePct,
        pnlAmount: (q.price - p.buyPrice) * p.quantity,
        pnlPct: ((q.price - p.buyPrice) / p.buyPrice) * 100,
      },
    ]
  })

  const totalPnl = rows.reduce((a, r) => a + r.pnlAmount, 0)
  const totalCost = rows.reduce((a, r) => a + r.buyPrice * r.quantity, 0)
  const totalPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  const submit = async () => {
    setFormErr(null)
    const secid = form.symbol.startsWith('6')
      ? `1.${form.symbol}`
      : form.symbol.startsWith('4') || form.symbol.startsWith('8') || form.symbol.startsWith('92')
        ? `0.${form.symbol}`
        : `0.${form.symbol}`
    if (!/^\d{6}$/.test(form.symbol)) return setFormErr('代码须为 6 位数字')
    if (!form.name.trim()) return setFormErr('请填写名称')
    const buyPrice = +form.buyPrice
    const quantity = +form.quantity
    if (!(buyPrice > 0) || !(quantity > 0)) return setFormErr('价格和数量须为正数')
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
      pos.refresh()
    } catch (err: any) {
      setFormErr(err?.message ?? '保存失败')
    }
  }

  return (
    <div className="panel-page">
      <div className="section-title">持仓盈亏</div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="form-row">
          <label>代码</label>
          <input style={{ width: 90 }} value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.trim() })} placeholder="600519" />
          <label>名称</label>
          <input style={{ width: 110 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="贵州茅台" />
          <label>成本价</label>
          <input style={{ width: 90 }} value={form.buyPrice} onChange={(e) => setForm({ ...form, buyPrice: e.target.value })} placeholder="1243.88" />
          <label>数量</label>
          <input style={{ width: 90 }} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="100" />
          <label>日期</label>
          <input style={{ width: 130 }} type="date" value={form.buyDate} onChange={(e) => setForm({ ...form, buyDate: e.target.value })} />
          <button className="btn" onClick={submit}>
            添加持仓
          </button>
        </div>
        {formErr && <div className="hint up">{formErr}</div>}
      </div>

      {rows.length > 0 && (
        <div className="pnl-summary card" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="label">总浮动盈亏</div>
            <div className={`value ${pctClass(totalPnl)}`}>
              {totalPnl > 0 ? '+' : ''}
              {fmtNum(totalPnl)}（{fmtPct(totalPct)}）
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
        <div className="empty">暂无持仓</div>
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>名称</th>
              <th>代码</th>
              <th>成本价</th>
              <th>数量</th>
              <th>现价</th>
              <th>今日涨跌</th>
              <th>浮动盈亏</th>
              <th>盈亏比例</th>
              <th>买入日期</th>
              <th></th>
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
                <td className={pctClass(r.pnlAmount)}>
                  {r.pnlAmount > 0 ? '+' : ''}
                  {fmtNum(r.pnlAmount)}
                </td>
                <td className={pctClass(r.pnlPct)}>{fmtPct(r.pnlPct)}</td>
                <td className="flat">{r.buyDate}</td>
                <td>
                  <button
                    className="btn danger small"
                    onClick={async () => {
                      await api.removePosition(r.id)
                      pos.refresh()
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {quotes.error && <div className="hint">行情加载失败：{quotes.error}</div>}
    </div>
  )
}
