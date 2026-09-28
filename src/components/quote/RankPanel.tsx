import { useState } from 'react'
import { api, type RankItem } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import { fmtNum, fmtAmount, fmtVolumeHand, pctClass, fmtPct } from '../../utils/format'

interface Props {
  active: boolean
  onSelectStock: (symbol: string) => void
}

export function RankPanel({ active, onSelectStock }: Props) {
  const [type, setType] = useState<'gainers' | 'losers'>('gainers')
  const rank = usePolling(() => api.rank(type), 10_000, [type])

  if (!active) return null

  const symbolToSecid = (symbol: string) => `${symbol.startsWith('6') ? 1 : 0}.${symbol}`

  return (
    <div className="panel-page">
      <div className="toolbar">
        <div className="seg">
          <button className={type === 'gainers' ? 'active' : ''} onClick={() => setType('gainers')}>
            涨幅榜
          </button>
          <button className={type === 'losers' ? 'active' : ''} onClick={() => setType('losers')}>
            跌幅榜
          </button>
        </div>
        <span className="hint">每 10 秒刷新 · 数据源新浪财经</span>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>#</th>
            <th>名称</th>
            <th>代码</th>
            <th>现价</th>
            <th>涨跌幅</th>
            <th>涨跌</th>
            <th>成交量</th>
            <th>成交额</th>
            <th>换手率</th>
          </tr>
        </thead>
        <tbody>
          {(rank.data?.items ?? []).map((r: RankItem, i) => (
            <tr key={r.symbol} onClick={() => onSelectStock(symbolToSecid(r.symbol))}>
              <td className="flat">{i + 1}</td>
              <td>{r.name}</td>
              <td className="flat">{r.symbol}</td>
              <td className={pctClass(r.changePct)}>{fmtNum(r.price)}</td>
              <td className={pctClass(r.changePct)}>{fmtPct(r.changePct)}</td>
              <td className={pctClass(r.changePct)}>{r.change > 0 ? '+' : ''}{fmtNum(r.change)}</td>
              <td className="flat">{fmtVolumeHand(r.volume / 100)}</td>
              <td className="flat">{fmtAmount(r.amount)}</td>
              <td className="flat">{r.turnoverRate.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rank.error && <div className="hint">加载失败：{rank.error}</div>}
    </div>
  )
}
