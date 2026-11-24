import { useMemo, useState } from 'react'
import { api, type Quote, type WatchItem } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import { fmtNum, fmtAmount, fmtVolumeHand, pctClass, fmtPct } from '../../utils/format'
import { ErrorState, LoadingState, RefreshState } from '../RequestState'

interface Props {
  active: boolean
  onSelectStock: (secid: string) => void
}

export function WatchlistPanel({ active, onSelectStock }: Props) {
  const watch = usePolling(() => api.watchlist(), 10_000)
  const secids = useMemo(() => watch.data?.items.map((i) => i.secid) ?? [], [watch.data])
  const quotes = usePolling<{ items: Quote[]; stale?: boolean }>(
    () => (secids.length ? api.quotes(secids) : Promise.resolve({ items: [] })),
    5000,
    [secids.join(',')],
  )
  const [actionError, setActionError] = useState<string | null>(null)

  if (!active) return null

  const remove = async (secid: string) => {
    setActionError(null)
    try {
      await api.removeWatch(secid)
      await watch.refresh()
    } catch (err: any) {
      setActionError(err?.message ?? '删除失败')
    }
  }

  return (
    <div className="panel-page">
      <div className="section-heading">
        <div className="section-title">自选行情 <span className="count">{watch.data?.items.length ?? 0}</span></div>
        <RefreshState
          loading={false}
          refreshing={watch.refreshing}
          error={watch.stale ? watch.error : null}
          stale={watch.stale}
          onRetry={() => { watch.refresh().catch(() => undefined) }}
        />
      </div>
      {watch.loading ? (
        <LoadingState label="正在加载自选…" />
      ) : watch.error && !watch.data ? (
        <ErrorState message={watch.error} onRetry={() => { watch.refresh().catch(() => undefined) }} />
      ) : secids.length === 0 ? (
        <div className="empty">
          <strong>还没有自选股票</strong>
          <span>在顶部搜索代码或名称，选择结果即可自动加入自选。</span>
        </div>
      ) : quotes.loading && !quotes.data ? (
        <LoadingState label="正在加载行情…" />
      ) : quotes.error && !quotes.data ? (
        <ErrorState message={quotes.error} onRetry={() => { quotes.refresh().catch(() => undefined) }} />
      ) : (
        <>
          <RefreshState
            loading={false}
            refreshing={quotes.refreshing}
            error={quotes.error}
            stale={quotes.stale || Boolean(quotes.data?.stale)}
            onRetry={() => { quotes.refresh().catch(() => undefined) }}
          />
          {(quotes.data?.items.length ?? 0) === 0 ? (
            <div className="empty">自选已保存，暂未获取到行情。</div>
          ) : (
            <div className="table-scroll">
              <table className="grid watchlist-grid">
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
                    <th aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {(quotes.data?.items ?? []).map((q) => (
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
                          type="button"
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
            </div>
          )}
        </>
      )}
      {actionError && <div className="hint up" role="alert">{actionError}</div>}
    </div>
  )
}

export type { WatchItem }
