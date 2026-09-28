import { useMemo } from 'react'
import { api, type Quote, type WatchItem } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import { fmtNum, fmtAmount, fmtVolumeHand, pctClass, fmtPct } from '../../utils/format'

interface Props {
  active: boolean
  onSelectStock: (secid: string) => void
}

export function WatchlistPanel({ active, onSelectStock }: Props) {
  const watch = usePolling(() => api.watchlist(), 10_000)
  const secids = useMemo(() => watch.data?.items.map((i) => i.secid) ?? [], [watch.data])
  const quotes = usePolling<Quote[]>(
    () => (secids.length ? api.quotes(secids).then((r) => r.items) : Promise.resolve([])),
    5000,
    [secids.join(',')],
  )

  if (!active) return null

  const remove = async (secid: string) => {
    await api.removeWatch(secid)
    watch.refresh()
  }

  return (
    <div className="panel-page">
      <div className="section-title">自选股（{watch.data?.items.length ?? 0}）</div>
      {secids.length === 0 ? (
        <div className="empty">暂无自选，用顶部搜索添加</div>
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>名称</th>
              <th>代码</th>
              <th>现价</th>
              <th>涨跌</th>
              <th>涨跌幅</th>
              <th>今开</th>
              <th>最高</th>
              <th>最低</th>
              <th>成交量</th>
              <th>成交额</th>
              <th>换手</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(quotes.data ?? []).map((q) => (
              <tr key={q.secid} onClick={() => onSelectStock(q.secid)}>
                <td>{q.name}</td>
                <td className="flat">{q.symbol}</td>
                <td className={pctClass(q.changePct)}>{fmtNum(q.price)}</td>
                <td className={pctClass(q.changePct)}>{q.change > 0 ? '+' : ''}{fmtNum(q.change)}</td>
                <td className={pctClass(q.changePct)}>{fmtPct(q.changePct)}</td>
                <td>{fmtNum(q.open)}</td>
                <td>{fmtNum(q.high)}</td>
                <td>{fmtNum(q.low)}</td>
                <td className="flat">{fmtVolumeHand(q.volume)}</td>
                <td className="flat">{fmtAmount(q.amount)}</td>
                <td className="flat">{q.turnoverRate?.toFixed(2) ?? '-'}%</td>
                <td>
                  <button
                    className="btn danger small"
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(q.secid)
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

export type { WatchItem }
